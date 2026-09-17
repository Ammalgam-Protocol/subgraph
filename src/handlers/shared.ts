import type { EvmOnEventContext, LendingToken, Pool, PoolDayData } from 'envio'

import { addAt, updateAt } from '../utils/array'
import {
  ADDRESS_ZERO,
  BORROW_L,
  BORROW_X,
  BORROW_Y,
  DAY_SECONDS,
  DEPOSIT_L,
  DEPOSIT_X,
  DEPOSIT_Y,
} from '../utils/constants'
import { type EventHeaderSource, lendingEventFields, transferEventFields } from '../utils/events'
import { getPositionId, scopedId } from '../utils/id'
import {
  calculateDepositLiquidityAssets,
  convertLToXAndY,
  depletionAdjustedActiveLiquidity,
  missingAssets,
  principalContribution,
  splitLendingFee,
  toAssets,
} from '../utils/math'
import { createDefaultPoolDayData } from '../utils/pool'
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

  // Recipient == pool.id only for penalty mints and bad-debt writeoffs, which are bookkeeping,
  // not participation: the Position row still writes for accounting, but positionCount skips it.
  const isPairPosition = userId === pool.id

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
    if (!isPairPosition) {
      user = { ...user, positionCount: user.positionCount + 1 }
      newPositions = 1
    }
  }

  return { user, position, positionId, newPositions }
}

// Shared by the 8 pool lending action handlers: counters + entities only.
// `isPairOriginated` skips the action counter (depositCount/borrowCount/...) and txCount.
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

function getAssets(
  context: EvmOnEventContext,
  lendingToken: LendingToken,
  tokenType: number,
  value: bigint,
  pool: Pool,
): bigint {
  if (lendingToken.pendingAssets !== undefined && lendingToken.pendingShares === value) {
    const assets = lendingToken.pendingAssets
    context.LendingToken.set({
      ...lendingToken,
      pendingAssets: undefined,
      pendingShares: undefined,
    })
    return assets
  }

  context.log.warn(`Direct transfer of ${value} shares on lending token ${lendingToken.id}`)
  return toAssets(value, pool.totalAssets[tokenType] ?? 0n, pool.totalShares[tokenType] ?? 0n)
}

function updateAssets(pool: Pool): bigint[] {
  const depositL = calculateDepositLiquidityAssets(
    pool.reserveX,
    pool.reserveY,
    pool.totalAssets[DEPOSIT_X] ?? 0n,
    pool.totalAssets[DEPOSIT_Y] ?? 0n,
    pool.totalAssets[BORROW_L] ?? 0n,
    pool.totalAssets[BORROW_X] ?? 0n,
    pool.totalAssets[BORROW_Y] ?? 0n,
  )
  return updateAt(pool.totalAssets, depositL, DEPOSIT_L)
}

export async function handleLendingTokenTransfer(event: TransferEvent, context: EvmOnEventContext) {
  const value = event.params.value
  const isMint = event.params.from.toLowerCase() === ADDRESS_ZERO
  const isBurn = event.params.to.toLowerCase() === ADDRESS_ZERO
  if (value === 0n && !isMint && !isBurn) return

  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  // A zero-value Transfer is real only when a Deposit or Repay stashed zero shares.
  if (value === 0n && lendingToken.pendingShares !== value) return

  const tokenType = lendingToken.tokenType
  const senderId = scopedId(event.chainId, event.params.from)
  const receiverId = scopedId(event.chainId, event.params.to)

  if (isMint) {
    const assets = getAssets(context, lendingToken, tokenType, value, pool)
    const principalDelta = principalContribution(tokenType, assets, pool)
    let updatedPool = {
      ...pool,
      totalShares: addAt(pool.totalShares, value, tokenType),
      totalAssets: addAt(pool.totalAssets, assets, tokenType),
    }
    if (tokenType !== DEPOSIT_L) {
      updatedPool = { ...updatedPool, totalAssets: updateAssets(updatedPool) }
    }
    const newPositions = await applyPositionDelta(
      context,
      event,
      updatedPool,
      receiverId,
      tokenType,
      value,
      principalDelta,
    )
    context.Pool.set({ ...updatedPool, positionCount: updatedPool.positionCount + newPositions })
    return
  }

  if (isBurn) {
    const assets = getAssets(context, lendingToken, tokenType, value, pool)
    const principalDelta = principalContribution(tokenType, assets, pool)
    let updatedPool = {
      ...pool,
      totalShares: addAt(pool.totalShares, -value, tokenType),
      totalAssets: addAt(pool.totalAssets, -assets, tokenType),
    }
    if (tokenType !== DEPOSIT_L) {
      updatedPool = { ...updatedPool, totalAssets: updateAssets(updatedPool) }
    }
    const newPositions = await applyPositionDelta(
      context,
      event,
      updatedPool,
      senderId,
      tokenType,
      -value,
      -principalDelta,
    )
    context.Pool.set({ ...updatedPool, positionCount: updatedPool.positionCount + newPositions })
    return
  }

  // Move: pool totals unchanged, both sides independent. Entity + counters only
  const floorAssets = toAssets(
    value,
    pool.totalAssets[tokenType] ?? 0n,
    pool.totalShares[tokenType] ?? 0n,
  )
  const principalDelta = principalContribution(tokenType, floorAssets, pool)

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
    -principalDelta,
    senderCounter,
  )
  const newFromReceiver = await applyPositionDelta(
    context,
    event,
    pool,
    receiverId,
    tokenType,
    value,
    principalDelta,
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
        amount: floorAssets,
        shares: value,
      }),
    )
  }
}

type FeeField = 'protocolFeesTokenX' | 'protocolFeesTokenY' | 'protocolFeesTokenL'

// Partial: a deposit-side token never has a protocol-fee column and vice versa, so a miss is a
// mis-wired lendingToken. Bucketing it into L would silently corrupt the aggregate.
const PROTOCOL_FEE_FIELDS: Partial<Record<number, FeeField>> = {
  [DEPOSIT_L]: 'protocolFeesTokenL',
  [DEPOSIT_X]: 'protocolFeesTokenX',
  [DEPOSIT_Y]: 'protocolFeesTokenY',
}

type PoolFeeDelta = Partial<Omit<PoolDayData, 'id' | 'pool_id' | 'date'>>

function applyDelta<T extends PoolFeeDelta>(row: T, deltas: PoolFeeDelta): T {
  const updated: Record<string, bigint | number> = { ...row }
  for (const key of Object.keys(deltas) as (keyof PoolFeeDelta)[]) {
    const delta = deltas[key]
    if (delta === undefined) continue
    const current = updated[key]
    updated[key] =
      typeof current === 'bigint' ? current + (delta as bigint) : current + (delta as number)
  }
  return updated as T
}

// Sole writer of fee/volume/count columns on Pool and its PoolDayData row
export async function accrueFees(
  context: EvmOnEventContext,
  pool: Pool,
  timestamp: number,
  deltas: PoolFeeDelta,
): Promise<Pool> {
  const date = Math.floor(timestamp / DAY_SECONDS) * DAY_SECONDS
  const dayId = `${pool.id}-${date}`
  const dayData =
    (await context.PoolDayData.get(dayId)) ?? createDefaultPoolDayData(dayId, pool.id, date)

  const updatedPool = applyDelta(pool, deltas)
  context.Pool.set(updatedPool)
  context.PoolDayData.set(applyDelta(dayData, deltas))

  return updatedPool
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

  let { pool: updatedPool, ...ids } = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'deposit',
    isPairOriginated: isProtocolFee,
  })

  if (isProtocolFee) {
    const field = PROTOCOL_FEE_FIELDS[lendingToken.tokenType]
    if (field) {
      let deltas: PoolFeeDelta = { [field]: event.params.assets }

      // L fees have no native X/Y split, so twin the mint into both legs
      if (lendingToken.tokenType === DEPOSIT_L) {
        const derivedTotalAssets = updateAssets(updatedPool)
        const activeLiquidity =
          (derivedTotalAssets[DEPOSIT_L] ?? 0n) - (updatedPool.totalAssets[BORROW_L] ?? 0n)
        const feeAsXY = convertLToXAndY(
          event.params.assets,
          updatedPool.reserveX,
          updatedPool.reserveY,
          activeLiquidity,
        )
        deltas = { ...deltas, protocolFeesTokenLAsX: feeAsXY.x, protocolFeesTokenLAsY: feeAsXY.y }
      }

      updatedPool = await accrueFees(context, updatedPool, event.block.timestamp, deltas)
    } else {
      context.log.warn(`no protocol fee column for tokenType ${lendingToken.tokenType}`)
    }

    // DEPOSIT_L fee mints dilute shares without adding assets, so we back out the fee.
    if (lendingToken.tokenType === DEPOSIT_L) {
      const totalAssets = updateAssets(updatedPool)
      updatedPool = {
        ...updatedPool,
        totalAssets: updateAt(
          totalAssets,
          (totalAssets[DEPOSIT_L] ?? 0n) - event.params.assets,
          DEPOSIT_L,
        ),
      }
      context.Pool.set(updatedPool)
    }
  }

  context.LendingToken.set({
    ...lendingToken,
    pendingAssets: event.params.assets,
    pendingShares: event.params.shares,
  })

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

  const { pool: _pool, ...ids } = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'withdraw',
    isPairOriginated: isBadDebtWriteoff,
  })

  context.LendingToken.set({
    ...lendingToken,
    pendingAssets: event.params.assets,
    pendingShares: event.params.shares,
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
    // Penalties mint as borrow L to the pair
    const { missingX, missingY } = missingAssets(
      pool.totalAssets[BORROW_X] ?? 0n,
      pool.totalAssets[DEPOSIT_X] ?? 0n,
      pool.totalAssets[BORROW_Y] ?? 0n,
      pool.totalAssets[DEPOSIT_Y] ?? 0n,
    )
    const activeBefore = depletionAdjustedActiveLiquidity(
      pool.reserveX,
      pool.reserveY,
      missingX,
      missingY,
    )
    const penaltyAsXY = convertLToXAndY(
      event.params.assets,
      pool.reserveX,
      pool.reserveY,
      activeBefore,
    )
    await accrueFees(context, updatedPool, event.block.timestamp, {
      penaltiesTokenL: event.params.assets,
      penaltiesTokenLAsX: penaltyAsXY.x,
      penaltiesTokenLAsY: penaltyAsXY.y,
    })
  } else if (!split) {
    // INITIAL_LENDING_FEE_BIPS changed upstream; null beats a wrong number.
    context.log.warn(
      `lending fee inversion failed for borrow of ${event.params.assets} on asset ${lendingToken.id}`,
    )
  }

  context.LendingToken.set({
    ...lendingToken,
    pendingAssets: event.params.assets,
    pendingShares: event.params.shares,
  })

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

  const { pool: _pool, ...ids } = await handleLendingAction(context, event, pool, {
    recipient,
    sender: event.params.sender,
    action: 'repay',
    isPairOriginated: isBadDebt,
  })

  context.LendingToken.set({
    ...lendingToken,
    pendingAssets: event.params.assets,
    pendingShares: event.params.shares,
  })

  context.Repay.set(lendingRow(event, pool, lendingToken, ids))
}
