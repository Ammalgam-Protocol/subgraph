import type { EvmOnEventContext } from 'envio'
import { indexer } from 'envio'

import { updateAt } from '../utils/array'
import { BORROW_L, BORROW_X, BORROW_Y, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y } from '../utils/constants'
import { getEventId, scopedId } from '../utils/id'
import { depletionAdjustedActiveLiquidity, mulDiv, mulDivCeil } from '../utils/math'
import { type ReferenceReserveObservation, readReferenceReserves } from '../utils/pairEffects'
import { poolPriceFields } from '../utils/pool'
import { BIPS_Q64, calculateSwapFeeBipsQ64 } from '../utils/swapFees'
import { getOrCreateUser } from './shared'

// depositL = depletion-adjusted active liquidity + borrowL.
function deriveDepositL(
  reserveX: bigint,
  reserveY: bigint,
  depositX: bigint,
  depositY: bigint,
  borrowL: bigint,
  borrowX: bigint,
  borrowY: bigint,
): bigint {
  const missingX = borrowX > depositX ? borrowX - depositX : 0n
  const missingY = borrowY > depositY ? borrowY - depositY : 0n
  return depletionAdjustedActiveLiquidity(reserveX, reserveY, missingX, missingY) + borrowL
}

indexer.onEvent({ contract: 'AmmalgamPair', event: 'Sync' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenX = await context.Token.get(pool.tokenX_id)
  const tokenY = await context.Token.get(pool.tokenY_id)
  if (!tokenX || !tokenY) return

  const depositL = deriveDepositL(
    event.params.reserveXAssets,
    event.params.reserveYAssets,
    pool.totalAssets[DEPOSIT_X] ?? 0n,
    pool.totalAssets[DEPOSIT_Y] ?? 0n,
    pool.totalAssets[BORROW_L] ?? 0n,
    pool.totalAssets[BORROW_X] ?? 0n,
    pool.totalAssets[BORROW_Y] ?? 0n,
  )

  // Both re-anchoring paths in the pair run through updateReserves, the sole emitter of
  // Sync, so this is the one call site that observes all of them; ref:
  // github.com/Ammalgam-Protocol/core-v1/blob/master/contracts/tokens/TokenController.sol
  const reference = await readReferenceReserves(
    context,
    event.chainId,
    event.srcAddress,
    event.block.number,
  )
  if (!reference) {
    context.log.warn(
      `referenceReserves read failed for pool ${poolId} at block ${event.block.number}; reference fields left null`,
    )
  }

  context.Pool.set({
    ...pool,
    ...poolPriceFields(tokenX, tokenY, event.params.reserveXAssets, event.params.reserveYAssets),
    totalAssets: updateAt(pool.totalAssets, depositL, DEPOSIT_L),
    syncCount: pool.syncCount + 1,
    ...(reference && {
      referenceReserveX: reference.referenceReserveX,
      referenceReserveY: reference.referenceReserveY,
    }),
  })

  context.Sync.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolId,
    reserveX: event.params.reserveXAssets,
    reserveY: event.params.reserveYAssets,
    referenceReserveX: reference?.referenceReserveX,
    referenceReserveY: reference?.referenceReserveY,
  })
})

type SwapFeeEvent = {
  chainId: number
  srcAddress: string
  block: { number: number }
  params: { amountXIn: bigint; amountYIn: bigint }
}

// All six null together: a partial result would pair a fee rate with no matching amount.
const NO_SWAP_FEES = {
  referenceReserveX: undefined,
  referenceReserveY: undefined,
  feeBipsQ64X: undefined,
  feeBipsQ64Y: undefined,
  feeAmountX: undefined,
  feeAmountY: undefined,
}

// Nulls rather than falling back to the current reserves, which would under-report the
// fee by up to 21x and still look plausible.
function computeSwapFees(
  context: EvmOnEventContext,
  event: SwapFeeEvent,
  pool: { id: string; reserveX: bigint; reserveY: bigint },
  reference: ReferenceReserveObservation,
) {
  try {
    // pool.reserveX/Y is pre-swap here: interest accrual emits Sync before Swap,
    // the post-swap updateReserves emits Sync after.
    const feeBipsQ64X = calculateSwapFeeBipsQ64(
      event.params.amountXIn,
      pool.reserveX,
      reference.referenceReserveX,
    )
    const feeBipsQ64Y = calculateSwapFeeBipsQ64(
      event.params.amountYIn,
      pool.reserveY,
      reference.referenceReserveY,
    )
    return {
      referenceReserveX: reference.referenceReserveX,
      referenceReserveY: reference.referenceReserveY,
      feeBipsQ64X,
      feeBipsQ64Y,
      // Ceiling, matching AmmalgamPair.calculateBalanceAfterFees: it subtracts `amountIn * fee`
      // before the Q64 division, so the pair retains the ceiling; ref:
      // github.com/Ammalgam-Protocol/core-v1/blob/master/contracts/AmmalgamPair.sol
      feeAmountX: mulDivCeil(event.params.amountXIn, feeBipsQ64X, BIPS_Q64),
      feeAmountY: mulDivCeil(event.params.amountYIn, feeBipsQ64Y, BIPS_Q64),
    }
  } catch {
    // Reachable on a zero reference reserve: the fee curves divide by it.
    context.log.warn(
      `swap fee computation failed for pool ${pool.id} at block ${event.block.number}; fee fields left null`,
    )
    return NO_SWAP_FEES
  }
}

indexer.onEvent({ contract: 'AmmalgamPair', event: 'Swap' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenX = await context.Token.get(pool.tokenX_id)
  const tokenY = await context.Token.get(pool.tokenY_id)
  if (!tokenX || !tokenY) return

  const reference = await readReferenceReserves(
    context,
    event.chainId,
    event.srcAddress,
    event.block.number,
  )
  if (!reference) {
    context.log.warn(
      `referenceReserves read failed for pool ${poolId} at block ${event.block.number}; fee fields left null`,
    )
  }

  const fees = reference ? computeSwapFees(context, event, pool, reference) : NO_SWAP_FEES

  const rawAmountXTotal = event.params.amountXOut + event.params.amountXIn
  const rawAmountYTotal = event.params.amountYOut + event.params.amountYIn

  context.Token.set({
    ...tokenX,
    volume: tokenX.volume + rawAmountXTotal,
    txCount: tokenX.txCount + 1,
  })
  context.Token.set({
    ...tokenY,
    volume: tokenY.volume + rawAmountYTotal,
    txCount: tokenY.txCount + 1,
  })

  context.Pool.set({
    ...pool,
    swapCount: pool.swapCount + 1,
    txCount: pool.txCount + 1,
    volumeTokenX: pool.volumeTokenX + rawAmountXTotal,
    volumeTokenY: pool.volumeTokenY + rawAmountYTotal,
    swapFeesTokenX: pool.swapFeesTokenX + (fees.feeAmountX ?? 0n),
    swapFeesTokenY: pool.swapFeesTokenY + (fees.feeAmountY ?? 0n),
  })

  const fromId = scopedId(event.chainId, event.transaction.from!)
  const fromUser = await getOrCreateUser(context, fromId)
  context.User.set({ ...fromUser, swapCount: fromUser.swapCount + 1 })

  const senderId = scopedId(event.chainId, event.params.sender)
  context.User.set(await getOrCreateUser(context, senderId))

  const toId = scopedId(event.chainId, event.params.to)
  context.User.set(await getOrCreateUser(context, toId))

  context.Swap.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolId,
    tokenX_id: pool.tokenX_id,
    tokenY_id: pool.tokenY_id,
    sender_id: senderId,
    from_id: fromId,
    to_id: toId,
    amountXIn: event.params.amountXIn,
    amountYIn: event.params.amountYIn,
    amountXOut: event.params.amountXOut,
    amountYOut: event.params.amountYOut,
    ...fees,
  })
})

indexer.onEvent({ contract: 'AmmalgamPair', event: 'Liquidate' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  context.Pool.set({
    ...pool,
    liquidateCount: pool.liquidateCount + 1,
    txCount: pool.txCount + 1,
  })

  const borrowerId = scopedId(event.chainId, event.params.borrower)
  const borrower = await getOrCreateUser(context, borrowerId)
  context.User.set({ ...borrower, liquidationCount: borrower.liquidationCount + 1 })

  const liquidatorId = scopedId(event.chainId, event.params.to)
  context.User.set(await getOrCreateUser(context, liquidatorId))

  context.Liquidate.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolId,
    borrower_id: borrowerId,
    liquidator_id: liquidatorId,
    seizedLAssets: event.params.seizedLAssets,
    seizedXAssets: event.params.seizedXAssets,
    seizedYAssets: event.params.seizedYAssets,
    repayXAssets: event.params.repayXAssets,
    repayYAssets: event.params.repayYAssets,
    actualRepaidXAssets: event.params.actualRepaidXAssets,
    actualRepaidYAssets: event.params.actualRepaidYAssets,
    liquidationType: event.params.liquidationType,
  })
})

indexer.onEvent(
  { contract: 'AmmalgamPair', event: 'InterestAccrued' },
  async ({ event, context }) => {
    const poolId = scopedId(event.chainId, event.srcAddress)
    const pool = await context.Pool.get(poolId)
    if (!pool) return

    const tokenX = await context.Token.get(pool.tokenX_id)
    const tokenY = await context.Token.get(pool.tokenY_id)
    if (!tokenX || !tokenY) return

    const depositL = deriveDepositL(
      event.params.reserveXAssets,
      event.params.reserveYAssets,
      event.params.depositXAssets,
      event.params.depositYAssets,
      event.params.borrowLAssets,
      event.params.borrowXAssets,
      event.params.borrowYAssets,
    )

    context.Pool.set({
      ...pool,
      ...poolPriceFields(tokenX, tokenY, event.params.reserveXAssets, event.params.reserveYAssets),
      totalAssets: [
        depositL,
        event.params.depositXAssets,
        event.params.depositYAssets,
        event.params.borrowLAssets,
        event.params.borrowXAssets,
        event.params.borrowYAssets,
      ],
      interestAccruedCount: pool.interestAccruedCount + 1,
    })

    context.InterestAccrued.set({
      id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
      hash: event.transaction.hash,
      logIndex: event.logIndex,
      blockNumber: BigInt(event.block.number),
      timestamp: BigInt(event.block.timestamp),
      pool_id: poolId,
      reserveX: event.params.reserveXAssets,
      reserveY: event.params.reserveYAssets,
      depositXAssets: event.params.depositXAssets,
      depositYAssets: event.params.depositYAssets,
      borrowLAssets: event.params.borrowLAssets,
      borrowXAssets: event.params.borrowXAssets,
      borrowYAssets: event.params.borrowYAssets,
    })
  },
)

indexer.onEvent({ contract: 'AmmalgamPair', event: 'BurnBadDebt' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenType = Number(event.params.tokenType)
  let totalAssets = pool.totalAssets
  if (tokenType === BORROW_L) {
    // Reserves untouched and no follow-up Sync on this path: back depositL out directly.
    totalAssets = updateAt(
      totalAssets,
      (totalAssets[DEPOSIT_L] ?? 0n) - event.params.badDebtAssets,
      DEPOSIT_L,
    )
  } else if (tokenType === BORROW_X || tokenType === BORROW_Y) {
    const reserve = tokenType === BORROW_X ? pool.reserveX : pool.reserveY
    const depositIndex = tokenType === BORROW_X ? DEPOSIT_X : DEPOSIT_Y
    const depositAssets = totalAssets[depositIndex] ?? 0n
    const burnReserves = mulDiv(event.params.badDebtAssets, reserve, depositAssets + reserve)
    // Reserves are not written here: the same-tx follow-up Sync sets them and re-derives depositL.
    totalAssets = updateAt(
      totalAssets,
      depositAssets - (event.params.badDebtAssets - burnReserves),
      depositIndex,
    )
  }

  const updatedPool = {
    ...pool,
    totalAssets,
    burnBadDebtCount: pool.burnBadDebtCount + 1,
  }

  context.Pool.set(updatedPool)

  const borrowerId = scopedId(event.chainId, event.params.borrower)
  context.User.set(await getOrCreateUser(context, borrowerId))

  context.BurnBadDebt.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolId,
    borrower_id: borrowerId,
    tokenType: event.params.tokenType,
    badDebtAssets: event.params.badDebtAssets,
    badDebtShares: event.params.badDebtShares,
  })
})

indexer.onEvent(
  { contract: 'AmmalgamPair', event: 'UpdateExternalLiquidity' },
  async ({ event, context }) => {
    const pool = await context.Pool.get(scopedId(event.chainId, event.srcAddress))
    if (!pool) return

    context.Pool.set({ ...pool, externalLiquidity: event.params.externalLiquidity })
  },
)
