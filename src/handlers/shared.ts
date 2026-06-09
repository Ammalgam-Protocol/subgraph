import type { EvmOnEventContext, Pool, Position, User } from 'envio'

import { addAt, subtractAt } from '../utils/array'
import { isIgnoredForTransfer } from '../utils/chains'
import { transferEventFields } from '../utils/events'
import { getPositionId, scopedId } from '../utils/id'
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

type AssetCounter = 'deposit' | 'withdraw' | 'borrow' | 'repay'

export async function loadLendingTokenAndPool(context: EvmOnEventContext, event: LoadEvent) {
  const lendingToken = await context.LendingToken.get(scopedId(event.chainId, event.srcAddress))
  if (!lendingToken) return undefined

  const pool = await context.Pool.get(lendingToken.pool_id)
  if (!pool) return undefined

  return { lendingToken, pool }
}

export async function getOrCreatePosition(
  context: EvmOnEventContext,
  userId: string,
  pool: { id: string },
  event: PositionEvent,
) {
  let user = await context.User.get(userId)
  if (!user) user = createDefaultUser(userId)

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

// Records the raw event.params.sender as a User if it does not already exist.
// Sender carries no counter change on asset-mutation events.
export async function ensureSender(context: EvmOnEventContext, senderId: string) {
  const sender = await context.User.get(senderId)
  if (!sender) context.User.set(createDefaultUser(senderId))
}

export function applyAssetDelta(
  context: EvmOnEventContext,
  args: {
    pool: Pool
    position: Position
    user: User
    newPositions: number
    tokenType: number
    assets: bigint
    shares: bigint
    sign: 1 | -1
    counter: AssetCounter
    principal: bigint
  },
) {
  const {
    pool,
    position,
    user,
    newPositions,
    tokenType,
    assets,
    shares,
    sign,
    counter,
    principal,
  } = args
  const apply = sign === 1 ? addAt : subtractAt
  const field = `${counter}Count` as const

  context.Pool.set({
    ...pool,
    positionCount: pool.positionCount + newPositions,
    totalAssets: apply(pool.totalAssets, assets, tokenType),
    totalShares: apply(pool.totalShares, shares, tokenType),
    [field]: pool[field] + 1,
    txCount: pool.txCount + 1,
  })

  context.Position.set({
    ...position,
    assets: apply(position.assets, assets, tokenType),
    shares: apply(position.shares, shares, tokenType),
    principal: position.principal + principal,
    [field]: position[field] + 1,
  })

  context.User.set({ ...user, [field]: user[field] + 1 })
}

export async function handleLendingTokenTransfer(event: TransferEvent, context: EvmOnEventContext) {
  if (
    isIgnoredForTransfer(event.chainId, event.params.from) ||
    isIgnoredForTransfer(event.chainId, event.params.to) ||
    event.params.value === 0n
  ) {
    return
  }

  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  const senderId = scopedId(event.chainId, event.params.from)
  const receiverId = scopedId(event.chainId, event.params.to)

  // Skip transfers to/from the pool contract itself (both sides chain-scoped, already lowercase).
  if (senderId === pool.id || receiverId === pool.id) return

  const tokenType = lendingToken.tokenType

  let sender = await context.User.get(senderId)
  if (!sender) sender = createDefaultUser(senderId)

  const senderPositionId = getPositionId(senderId, pool.id)
  const senderPosition = await context.Position.get(senderPositionId)
  if (!senderPosition) return

  const updatedSenderPosition = {
    ...senderPosition,
    assets: subtractAt(senderPosition.assets, event.params.value, tokenType),
    shares: subtractAt(senderPosition.shares, event.params.value, tokenType),
    transferredCount: senderPosition.transferredCount + 1,
  }

  let receiver = await context.User.get(receiverId)
  if (!receiver) receiver = createDefaultUser(receiverId)

  const receiverPositionId = getPositionId(receiverId, pool.id)
  let receiverPosition = await context.Position.get(receiverPositionId)
  let newPositions = 0
  if (!receiverPosition) {
    receiverPosition = createDefaultPosition(
      receiverId,
      pool.id,
      event.transaction.hash,
      BigInt(event.block.number),
      BigInt(event.block.timestamp),
    )
    receiver = { ...receiver, positionCount: receiver.positionCount + 1 }
    newPositions = 1
  }

  const updatedReceiverPosition = {
    ...receiverPosition,
    assets: addAt(receiverPosition.assets, event.params.value, tokenType),
    shares: addAt(receiverPosition.shares, event.params.value, tokenType),
    receivedCount: receiverPosition.receivedCount + 1,
  }

  context.Pool.set({
    ...pool,
    positionCount: pool.positionCount + newPositions,
    transferCount: pool.transferCount + 1,
    txCount: pool.txCount + 1,
  })
  context.Position.set(updatedSenderPosition)
  context.Position.set(updatedReceiverPosition)
  context.User.set({ ...sender, transferredCount: sender.transferredCount + 1 })
  context.User.set({ ...receiver, receivedCount: receiver.receivedCount + 1 })

  context.Transfer.set(
    transferEventFields(event, event.params.value, {
      senderId,
      receiverId,
      poolId: pool.id,
      senderPositionId,
      receiverPositionId,
      assetId: lendingToken.id,
    }),
  )
}
