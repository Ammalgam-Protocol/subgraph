import type { EvmOnEventContext, Pool } from 'envio'

import { addAt, updateAt } from '../utils/array'
import { ADDRESS_ZERO } from '../utils/constants'
import { transferEventFields } from '../utils/events'
import { getPositionId, scopedId } from '../utils/id'
import { principalContribution, toAssets } from '../utils/math'
import { createDefaultPosition } from '../utils/position'
import { createDefaultUser } from '../utils/user'

// Minimal structural event types: any decoded Envio event satisfies these.
type LoadEvent = {
  chainId: number
  srcAddress: string
}

type PositionEvent = {
  block: { number: number; timestamp: number }
  transaction: { hash: string }
}

type TransferEvent = LoadEvent &
  PositionEvent & {
    logIndex: number
    params: { from: string; to: string; value: bigint }
  }

type PoolAction = 'deposit' | 'withdraw' | 'borrow' | 'repay'
type TransferType = 'transferred' | 'received'

export async function loadLendingTokenAndPool(context: EvmOnEventContext, event: LoadEvent) {
  const lendingToken = await context.LendingToken.get(scopedId(event.chainId, event.srcAddress))
  if (!lendingToken) return undefined

  const pool = await context.Pool.get(lendingToken.pool_id)
  if (!pool) return undefined

  return { lendingToken, pool }
}

export async function getOrCreateUser(context: EvmOnEventContext, userId: string) {
  return (await context.User.get(userId)) ?? createDefaultUser(userId)
}

export async function getOrCreatePosition(
  context: EvmOnEventContext,
  userId: string,
  pool: { id: string },
  event: PositionEvent,
) {
  let user = await getOrCreateUser(context, userId)

  const positionId = getPositionId(userId, pool.id)
  let position = await context.Position.get(positionId)
  let newPositions = 0
  if (!position) {
    position = createDefaultPosition(
      userId,
      pool.id,
      event.transaction.hash,
      BigInt(event.block.number),
      BigInt(event.block.timestamp),
    )
    user = { ...user, positionCount: user.positionCount + 1 }
    newPositions = 1
  }

  return { user, position, positionId, newPositions }
}

// Shared by the 8 pool lending action handlers: counters + entities only.
export async function handleLendingAction(
  context: EvmOnEventContext,
  event: PositionEvent & { chainId: number },
  pool: Pool,
  args: { recipient: string; sender: string; action: PoolAction },
): Promise<{ userId: string; senderId: string; positionId: string }> {
  const userId = scopedId(event.chainId, args.recipient)
  const { user, position, positionId, newPositions } = await getOrCreatePosition(
    context,
    userId,
    pool,
    event,
  )
  const field = `${args.action}Count` as const

  context.Pool.set({
    ...pool,
    positionCount: pool.positionCount + newPositions,
    [field]: pool[field] + 1,
    txCount: pool.txCount + 1,
  })
  context.Position.set({ ...position, [field]: position[field] + 1 })
  context.User.set({ ...user, [field]: user[field] + 1 })

  // No counter/position mutation: sender only needs a User row to exist.
  const senderId = scopedId(event.chainId, args.sender)
  context.User.set(await getOrCreateUser(context, senderId))

  return { userId, senderId, positionId }
}

// Recomputes assets from the post-delta pool rate, not pre-delta.
// Returns 1 when a new Position row is created.
async function applyPositionDelta(
  context: EvmOnEventContext,
  event: PositionEvent,
  pool: Pool,
  userId: string,
  tokenType: number,
  sharesDelta: bigint,
  principalDelta: bigint,
  transferType?: TransferType,
): Promise<number> {
  let user = await getOrCreateUser(context, userId)

  const positionId = getPositionId(userId, pool.id)
  let position = await context.Position.get(positionId)
  let newPositions = 0
  if (!position) {
    position = createDefaultPosition(
      userId,
      pool.id,
      event.transaction.hash,
      BigInt(event.block.number),
      BigInt(event.block.timestamp),
    )
    user = { ...user, positionCount: user.positionCount + 1 }
    newPositions = 1
  }

  const shares = addAt(position.shares, sharesDelta, tokenType)
  const assets = updateAt(
    position.assets,
    toAssets(
      shares[tokenType] ?? 0n,
      pool.totalAssets[tokenType] ?? 0n,
      pool.totalShares[tokenType] ?? 0n,
    ),
    tokenType,
  )

  const counterField = transferType ? (`${transferType}Count` as const) : undefined
  context.User.set(counterField ? { ...user, [counterField]: user[counterField] + 1 } : user)
  context.Position.set({
    ...position,
    shares,
    assets,
    principal: position.principal + principalDelta,
    ...(counterField ? { [counterField]: position[counterField] + 1 } : {}),
  })
  return newPositions
}

export async function handleLendingTokenTransfer(event: TransferEvent, context: EvmOnEventContext) {
  if (event.params.value === 0n) return

  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  const tokenType = lendingToken.tokenType
  const value = event.params.value
  const senderId = scopedId(event.chainId, event.params.from)
  const receiverId = scopedId(event.chainId, event.params.to)

  // Pre-delta rate: implied assets and principal use the totals before this transfer.
  const assetsImplied = toAssets(
    value,
    pool.totalAssets[tokenType] ?? 0n,
    pool.totalShares[tokenType] ?? 0n,
  )
  const contribution = principalContribution(tokenType, assetsImplied, pool)

  const isMint = event.params.from.toLowerCase() === ADDRESS_ZERO
  const isBurn = event.params.to.toLowerCase() === ADDRESS_ZERO

  if (isMint) {
    const updatedPool = {
      ...pool,
      totalShares: addAt(pool.totalShares, value, tokenType),
      totalAssets: addAt(pool.totalAssets, assetsImplied, tokenType),
    }
    const newPositions = await applyPositionDelta(
      context,
      event,
      updatedPool,
      receiverId,
      tokenType,
      value,
      contribution,
    )
    context.Pool.set({ ...updatedPool, positionCount: updatedPool.positionCount + newPositions })
    return
  }

  if (isBurn) {
    const updatedPool = {
      ...pool,
      totalShares: addAt(pool.totalShares, -value, tokenType),
      totalAssets: addAt(pool.totalAssets, -assetsImplied, tokenType),
    }
    const newPositions = await applyPositionDelta(
      context,
      event,
      updatedPool,
      senderId,
      tokenType,
      -value,
      -contribution,
    )
    context.Pool.set({ ...updatedPool, positionCount: updatedPool.positionCount + newPositions })
    return
  }

  // Move: pool totals unchanged, both sides independent. Entity + counters only
  const isUserFacing = senderId !== pool.id && receiverId !== pool.id
  const senderCounter = isUserFacing ? ('transferred' as const) : undefined
  const receiverCounter = isUserFacing ? ('received' as const) : undefined

  const newFromSender = await applyPositionDelta(
    context,
    event,
    pool,
    senderId,
    tokenType,
    -value,
    -contribution,
    senderCounter,
  )
  const newFromReceiver = await applyPositionDelta(
    context,
    event,
    pool,
    receiverId,
    tokenType,
    value,
    contribution,
    receiverCounter,
  )

  context.Pool.set({
    ...pool,
    positionCount: pool.positionCount + newFromSender + newFromReceiver,
    ...(isUserFacing ? { transferCount: pool.transferCount + 1, txCount: pool.txCount + 1 } : {}),
  })

  if (isUserFacing) {
    context.Transfer.set(
      transferEventFields(event, {
        senderId,
        receiverId,
        poolId: pool.id,
        senderPositionId: getPositionId(senderId, pool.id),
        receiverPositionId: getPositionId(receiverId, pool.id),
        assetId: lendingToken.id,
        amount: assetsImplied,
        shares: value,
      }),
    )
  }
}
