import type { EvmOnEventContext, LendingToken, Pool } from 'envio'

import { addAt, updateAt } from '../utils/array'
import {
  ADDRESS_ZERO,
  BORROW_L,
  BORROW_X,
  BORROW_Y,
  DEPOSIT_L,
  DEPOSIT_X,
  DEPOSIT_Y,
} from '../utils/constants'
import { type EventHeaderSource, lendingEventFields, transferEventFields } from '../utils/events'
import { getPositionId, scopedId } from '../utils/id'
import { principalContribution, splitLendingFee, toAssets } from '../utils/math'
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

// The address is passed in rather than read off the event: each event names the field it
// carries differently (`sender`, `receiver` on Withdraw, `to` on Burn).
function isPairAddress(chainId: number, address: string, pool: { id: string }): boolean {
  return scopedId(chainId, address) === pool.id
}

// Only pair bookkeeping (mintProtocolFees, mintPenalties, burnBadDebt) sends as address(this).
// Not usable on Withdraw: ownerBurn is onlyOwner, so the pair is the sender on every withdrawal.
function isPairSender(
  event: { chainId: number; params: { sender: string } },
  pool: { id: string },
): boolean {
  return isPairAddress(event.chainId, event.params.sender, pool)
}

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

async function getOrCreatePosition(
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
// `isPairOriginated` still writes the Position and User rows, but skips every counter.
async function handleLendingAction(
  context: EvmOnEventContext,
  event: EventHeaderSource,
  pool: Pool,
  args: {
    recipient: string
    sender: string
    action: PoolAction
    isPairOriginated?: boolean
  },
): Promise<{ userId: string; senderId: string; positionId: string; pool: Pool }> {
  const userId = scopedId(event.chainId, args.recipient)
  const { user, position, positionId, newPositions } = await getOrCreatePosition(
    context,
    userId,
    pool,
    event,
  )
  const field = `${args.action}Count` as const
  const bump = args.isPairOriginated ? 0 : 1

  const updatedPool: Pool = {
    ...pool,
    positionCount: pool.positionCount + newPositions,
    [field]: pool[field] + bump,
    txCount: pool.txCount + bump,
  }
  context.Position.set({ ...position, [field]: position[field] + bump })
  context.User.set({ ...user, [field]: user[field] + bump })

  // No counter/position mutation: sender only needs a User row to exist.
  const senderId = scopedId(event.chainId, args.sender)
  context.User.set(await getOrCreateUser(context, senderId))

  context.Pool.set(updatedPool)

  // Returned so fee accrual can extend this pool rather than re-reading the store.
  return { userId, senderId, positionId, pool: updatedPool }
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

type FeeField =
  | 'protocolFeesTokenX'
  | 'protocolFeesTokenY'
  | 'protocolFeesTokenL'
  | 'lendingFeesTokenX'
  | 'lendingFeesTokenY'
  | 'lendingFeesTokenL'
  | 'penaltiesAccrued'

// Partial: a deposit-side token never has a lending-fee column and vice versa, so a miss is a
// mis-wired lendingToken. Bucketing it into L would silently corrupt the aggregate.
const PROTOCOL_FEE_FIELDS: Partial<Record<number, FeeField>> = {
  [DEPOSIT_L]: 'protocolFeesTokenL',
  [DEPOSIT_X]: 'protocolFeesTokenX',
  [DEPOSIT_Y]: 'protocolFeesTokenY',
}

const LENDING_FEE_FIELDS: Partial<Record<number, FeeField>> = {
  [BORROW_L]: 'lendingFeesTokenL',
  [BORROW_X]: 'lendingFeesTokenX',
  [BORROW_Y]: 'lendingFeesTokenY',
}

// Additive aggregation only: fee mints already flow through the Transfer spine,
// so this never touches shares/assets/principal or pool totals.
function accrueFee(context: EvmOnEventContext, pool: Pool, field: FeeField, amount: bigint) {
  context.Pool.set({ ...pool, [field]: pool[field] + amount })
}

function accrueProtocolFee(
  context: EvmOnEventContext,
  pool: Pool,
  lendingToken: { tokenType: number },
  amount: bigint,
) {
  const field = PROTOCOL_FEE_FIELDS[lendingToken.tokenType]
  if (!field) {
    context.log.warn(`no protocol fee column for tokenType ${lendingToken.tokenType}`)
    return
  }
  accrueFee(context, pool, field, amount)
}

function accrueLendingFee(
  context: EvmOnEventContext,
  pool: Pool,
  lendingToken: { tokenType: number },
  lendingFee: bigint,
) {
  const field = LENDING_FEE_FIELDS[lendingToken.tokenType]
  if (!field) {
    context.log.warn(`no lending fee column for tokenType ${lendingToken.tokenType}`)
    return
  }
  accrueFee(context, pool, field, lendingFee)
}

// Saturation penalties are minted as BORROW_L debt with the pair as `sender`.
function accruePenalty(context: EvmOnEventContext, pool: Pool, amount: bigint) {
  accrueFee(context, pool, 'penaltiesAccrued', amount)
}

type LendingActionEvent = EventHeaderSource & {
  params: { sender: string; assets: bigint; shares: bigint }
}

function lendingRow(
  event: LendingActionEvent,
  pool: Pool,
  lendingToken: LendingToken,
  ids: { userId: string; senderId: string; positionId: string },
) {
  return lendingEventFields(event, {
    userId: ids.userId,
    senderId: ids.senderId,
    positionId: ids.positionId,
    poolId: pool.id,
    assetId: lendingToken.id,
    amount: event.params.assets,
    shares: event.params.shares,
  })
}

export async function handleDepositAction(
  context: EvmOnEventContext,
  event: LendingActionEvent,
  pool: Pool,
  lendingToken: LendingToken,
  recipient: string,
) {
  // mintProtocolFees routes through ownerMint, the only pair-sender deposit path.
  const isProtocolFee = isPairSender(event, pool)

  const { pool: updatedPool, ...ids } = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'deposit',
    isPairOriginated: isProtocolFee,
  })

  if (isProtocolFee) accrueProtocolFee(context, updatedPool, lendingToken, event.params.assets)

  context.Deposit.set({ ...lendingRow(event, pool, lendingToken, ids), isProtocolFee })
}

export async function handleWithdrawAction(
  context: EvmOnEventContext,
  event: LendingActionEvent,
  pool: Pool,
  lendingToken: LendingToken,
  recipient: string,
) {
  // Both events name the router as sender, so the recipient is the only side that identifies
  // the writeoff: liquidation burns leftover collateral to the pair itself.
  const isBadDebtWriteoff = isPairAddress(event.chainId, recipient, pool)

  const ids = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'withdraw',
    isPairOriginated: isBadDebtWriteoff,
  })

  context.Withdraw.set(lendingRow(event, pool, lendingToken, ids))
}

export async function handleBorrowAction(
  context: EvmOnEventContext,
  event: LendingActionEvent,
  pool: Pool,
  lendingToken: LendingToken,
  recipient: string,
) {
  // mintPenalties only mints BORROW_L, so a tokenX/tokenY borrow is never a penalty and always
  // carries the 5-bip fee. Inverting a penalty would fabricate one.
  const isPenalty = lendingToken.tokenType === BORROW_L && isPairSender(event, pool)

  const { pool: updatedPool, ...ids } = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'borrow',
    isPairOriginated: isPenalty,
  })

  const split = isPenalty ? undefined : splitLendingFee(event.params.assets)
  if (isPenalty) {
    accruePenalty(context, updatedPool, event.params.assets)
  } else if (split) {
    accrueLendingFee(context, updatedPool, lendingToken, split.lendingFee)
  } else {
    // INITIAL_LENDING_FEE_BIPS changed upstream; null beats a wrong number.
    context.log.warn(
      `lending fee inversion failed for borrow of ${event.params.assets} on asset ${lendingToken.id}`,
    )
  }

  context.Borrow.set({
    ...lendingRow(event, pool, lendingToken, ids),
    lendingFee: split?.lendingFee,
    isPenalty,
  })
}

export async function handleRepayAction(
  context: EvmOnEventContext,
  event: LendingActionEvent,
  pool: Pool,
  lendingToken: LendingToken,
  recipient: string,
) {
  // pair.ts already records the writeoff as BurnBadDebt, so counting it would double it.
  const isBadDebt = isPairSender(event, pool)

  const ids = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'repay',
    isPairOriginated: isBadDebt,
  })

  context.Repay.set(lendingRow(event, pool, lendingToken, ids))
}
