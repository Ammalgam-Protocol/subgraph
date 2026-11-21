import { indexer } from 'envio'

import { updateAt } from '../utils/array'
import {
  BORROW_L,
  BORROW_X,
  BORROW_Y,
  DEPOSIT_L,
  DEPOSIT_X,
  DEPOSIT_Y,
  LENDING_FEE_RATE,
} from '../utils/constants'
import { getEventId, getPositionId, scopedId } from '../utils/id'
import { liquidationKind, liquidationPremiumFields } from '../utils/liquidation'
import {
  calculateDepositLiquidityAssets,
  convertLToXAndY,
  depletionAdjustedActiveLiquidity,
  missingAssets,
  mulDiv,
  mulDivCeil,
  splitSwapFee,
  swapFeeGrowth,
} from '../utils/math'
import { poolPriceFields } from '../utils/pool'
import {
  addPendingFields,
  clearPendingFields,
  getLendingTokenIndex,
  getPendingFields,
} from '../utils/position'
import { accrueFees, getOrCreateUser } from './shared'

indexer.onEvent({ contract: 'AmmalgamPair', event: 'Sync' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenX = await context.Token.get(pool.tokenX_id)
  const tokenY = await context.Token.get(pool.tokenY_id)
  if (!tokenX || !tokenY) return

  const depositL = calculateDepositLiquidityAssets(
    event.params.reserveXAssets,
    event.params.reserveYAssets,
    pool.totalAssets[DEPOSIT_X] ?? 0n,
    pool.totalAssets[DEPOSIT_Y] ?? 0n,
    pool.totalAssets[BORROW_L] ?? 0n,
    pool.totalAssets[BORROW_X] ?? 0n,
    pool.totalAssets[BORROW_Y] ?? 0n,
  )

  context.Pool.set({
    ...pool,
    ...poolPriceFields(tokenX, tokenY, event.params.reserveXAssets, event.params.reserveYAssets),
    totalAssets: updateAt(pool.totalAssets, depositL, DEPOSIT_L),
    syncCount: pool.syncCount + 1,
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
  })
})

indexer.onEvent({ contract: 'AmmalgamPair', event: 'Swap' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenX = await context.Token.get(pool.tokenX_id)
  const tokenY = await context.Token.get(pool.tokenY_id)
  if (!tokenX || !tokenY) return

  const { missingX, missingY } = missingAssets(
    pool.totalAssets[BORROW_X],
    pool.totalAssets[DEPOSIT_X],
    pool.totalAssets[BORROW_Y],
    pool.totalAssets[DEPOSIT_Y],
  )

  const reserveXBefore = pool.reserveX
  const reserveYBefore = pool.reserveY
  const reserveXAfter = reserveXBefore + event.params.amountXIn - event.params.amountXOut
  const reserveYAfter = reserveYBefore + event.params.amountYIn - event.params.amountYOut

  const feeL = swapFeeGrowth(
    reserveXBefore,
    reserveYBefore,
    reserveXAfter,
    reserveYAfter,
    missingX,
    missingY,
  )
  const calculatedFees = splitSwapFee(
    event.params.amountXIn,
    event.params.amountYIn,
    event.params.amountXOut,
    event.params.amountYOut,
    reserveXBefore,
    reserveYBefore,
    missingX,
    missingY,
  )
  if (!calculatedFees) {
    context.log.warn(`Swap fee-free invariant failed for full input on pool ${poolId}`)
  }
  const nativeFees = calculatedFees ?? { feeAmountX: 0n, feeAmountY: 0n }
  const fees = { feeL, ...nativeFees }

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

  await accrueFees(context, pool, event.block.timestamp, {
    swapCount: 1,
    txCount: 1,
    volumeTokenX: rawAmountXTotal,
    volumeTokenY: rawAmountYTotal,
    swapFeesTokenX: fees.feeAmountX,
    swapFeesTokenY: fees.feeAmountY,
    swapFeesTokenL: fees.feeL,
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
  const kind = liquidationKind(event.params.liquidationType)
  if (!kind) {
    context.log.warn(
      `Liquidate with unsupported type ${event.params.liquidationType} on chain ${event.chainId} pool ${poolId} tx ${event.transaction.hash}`,
    )
    return
  }

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

  const recipient = event.params.to.toLowerCase()
  // transaction.from is the account that paid for the liquidation; `to` only receives the shares.
  const liquidatorId = scopedId(event.chainId, (event.transaction.from ?? recipient).toLowerCase())
  context.User.set(await getOrCreateUser(context, liquidatorId))
  const recipientId = scopedId(event.chainId, recipient)
  if (recipientId !== liquidatorId) context.User.set(await getOrCreateUser(context, recipientId))

  const target = event.transaction.to?.toLowerCase()
  const liquidatorContract =
    target && target !== event.srcAddress.toLowerCase() ? target : undefined

  const borrowerPosition = await context.Position.get(getPositionId(borrowerId, poolId))
  const pending = getPendingFields(borrowerPosition, event.transaction.hash)
  if (borrowerPosition) context.Position.set(clearPendingFields(borrowerPosition))

  const { missingX, missingY } = missingAssets(
    pool.totalAssets[BORROW_X] ?? 0n,
    pool.totalAssets[DEPOSIT_X] ?? 0n,
    pool.totalAssets[BORROW_Y] ?? 0n,
    pool.totalAssets[DEPOSIT_Y] ?? 0n,
  )
  const activeLiquidity = depletionAdjustedActiveLiquidity(
    pool.reserveX,
    pool.reserveY,
    missingX,
    missingY,
  )

  context.Liquidate.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolId,
    borrower_id: borrowerId,
    liquidator_id: liquidatorId,
    liquidatorContract,
    recipient_id: recipientId,
    actualRepaidXAssets: event.params.actualRepaidXAssets,
    actualRepaidYAssets: event.params.actualRepaidYAssets,
    liquidationType: event.params.liquidationType,
    kind,
    repaidDebtLAssets: pending.repaid[0],
    repaidDebtXAssets: pending.repaid[1],
    repaidDebtYAssets: pending.repaid[2],
    seizedLAssets: pending.seized[0],
    seizedXAssets: pending.seized[1],
    seizedYAssets: pending.seized[2],
    reserveX: pool.reserveX,
    reserveY: pool.reserveY,
    badDebtLAssets: pending.badDebt[0],
    badDebtXAssets: pending.badDebt[1],
    badDebtYAssets: pending.badDebt[2],
    ...liquidationPremiumFields({
      seized: pending.seized,
      repaid: pending.repaid,
      reserveX: pool.reserveX,
      reserveY: pool.reserveY,
      activeLiquidity,
    }),
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

    const grossInterest = (post: bigint, pre: bigint, label: string): bigint => {
      if (post >= pre) return post - pre
      context.log.warn(`InterestAccrued: negative gross ${label} interest on pool ${poolId}`)
      return 0n
    }
    const grossX = grossInterest(event.params.borrowXAssets, pool.totalAssets[BORROW_X] ?? 0n, 'X')
    const grossY = grossInterest(event.params.borrowYAssets, pool.totalAssets[BORROW_Y] ?? 0n, 'Y')
    const grossL = grossInterest(event.params.borrowLAssets, pool.totalAssets[BORROW_L] ?? 0n, 'L')

    const protocolInterestX = mulDivCeil(grossX, LENDING_FEE_RATE, 100n)
    const protocolInterestY = mulDivCeil(grossY, LENDING_FEE_RATE, 100n)
    const protocolInterestL = mulDivCeil(grossL, LENDING_FEE_RATE, 100n)

    const depositL = calculateDepositLiquidityAssets(
      event.params.reserveXAssets,
      event.params.reserveYAssets,
      event.params.depositXAssets + protocolInterestX,
      event.params.depositYAssets + protocolInterestY,
      event.params.borrowLAssets,
      event.params.borrowXAssets,
      event.params.borrowYAssets,
    )

    const missingBefore = missingAssets(
      pool.totalAssets[BORROW_X] ?? 0n,
      pool.totalAssets[DEPOSIT_X] ?? 0n,
      pool.totalAssets[BORROW_Y] ?? 0n,
      pool.totalAssets[DEPOSIT_Y] ?? 0n,
    )
    const activeLiquidityAssetsBefore = depletionAdjustedActiveLiquidity(
      pool.reserveX,
      pool.reserveY,
      missingBefore.missingX,
      missingBefore.missingY,
    )
    const activeLiquidityAssetsAfter = depositL - event.params.borrowLAssets
    const lpInterestL =
      activeLiquidityAssetsAfter > activeLiquidityAssetsBefore
        ? activeLiquidityAssetsAfter - activeLiquidityAssetsBefore
        : 0n

    const grossInterestLAsXY = convertLToXAndY(
      grossL,
      event.params.reserveXAssets,
      event.params.reserveYAssets,
      activeLiquidityAssetsAfter,
    )
    const protocolInterestLAsXY = convertLToXAndY(
      protocolInterestL,
      event.params.reserveXAssets,
      event.params.reserveYAssets,
      activeLiquidityAssetsAfter,
    )
    const lpInterestLAsXY = convertLToXAndY(
      lpInterestL,
      event.params.reserveXAssets,
      event.params.reserveYAssets,
      activeLiquidityAssetsAfter,
    )

    const updatedPool = await accrueFees(context, pool, event.block.timestamp, {
      grossInterestTokenX: grossX,
      grossInterestTokenY: grossY,
      grossInterestTokenL: grossL,
      grossInterestTokenLAsX: grossInterestLAsXY.x,
      grossInterestTokenLAsY: grossInterestLAsXY.y,
      protocolInterestTokenX: protocolInterestX,
      protocolInterestTokenY: protocolInterestY,
      protocolInterestTokenL: protocolInterestL,
      protocolInterestTokenLAsX: protocolInterestLAsXY.x,
      protocolInterestTokenLAsY: protocolInterestLAsXY.y,
      lpInterestTokenL: lpInterestL,
      lpInterestTokenLAsX: lpInterestLAsXY.x,
      lpInterestTokenLAsY: lpInterestLAsXY.y,
    })

    context.Pool.set({
      ...updatedPool,
      ...poolPriceFields(tokenX, tokenY, event.params.reserveXAssets, event.params.reserveYAssets),
      totalAssets: [
        depositL,
        event.params.depositXAssets,
        event.params.depositYAssets,
        event.params.borrowLAssets,
        event.params.borrowXAssets,
        event.params.borrowYAssets,
      ],
      pendingProtocolInterestTxHash: protocolInterestL > 0n ? event.transaction.hash : undefined,
      interestAccruedCount: updatedPool.interestAccruedCount + 1,
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
      grossInterestX: grossX,
      grossInterestY: grossY,
      grossInterestL: grossL,
      lpInterestL,
    })
  },
)

indexer.onEvent({ contract: 'AmmalgamPair', event: 'BurnBadDebt' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenType = Number(event.params.tokenType)
  let totalAssets = pool.totalAssets
  if (tokenType === BORROW_X || tokenType === BORROW_Y) {
    const reserve = tokenType === BORROW_X ? pool.reserveX : pool.reserveY
    const depositIndex = tokenType === BORROW_X ? DEPOSIT_X : DEPOSIT_Y
    const depositAssets = totalAssets[depositIndex] ?? 0n
    const burnReserves = mulDiv(event.params.badDebtAssets, reserve, depositAssets + reserve)
    // Reserves stay as-is: the same-tx follow-up Sync writes them.
    totalAssets = updateAt(
      totalAssets,
      depositAssets - (event.params.badDebtAssets - burnReserves),
      depositIndex,
    )
    const depositL = calculateDepositLiquidityAssets(
      pool.reserveX,
      pool.reserveY,
      totalAssets[DEPOSIT_X] ?? 0n,
      totalAssets[DEPOSIT_Y] ?? 0n,
      totalAssets[BORROW_L] ?? 0n,
      totalAssets[BORROW_X] ?? 0n,
      totalAssets[BORROW_Y] ?? 0n,
    )
    totalAssets = updateAt(totalAssets, depositL, DEPOSIT_L)
  }

  const updatedPool = {
    ...pool,
    totalAssets,
    burnBadDebtCount: pool.burnBadDebtCount + 1,
  }

  context.Pool.set(updatedPool)

  const borrowerId = scopedId(event.chainId, event.params.borrower)
  context.User.set(await getOrCreateUser(context, borrowerId))

  const borrowerPosition = await context.Position.get(getPositionId(borrowerId, poolId))
  if (borrowerPosition && tokenType >= BORROW_L) {
    const index = getLendingTokenIndex(tokenType)
    const assets = event.params.badDebtAssets
    const hash = event.transaction.hash
    const stashed = addPendingFields(borrowerPosition, hash, 'pendingBadDebtAssets', index, assets)
    context.Position.set(addPendingFields(stashed, hash, 'pendingRepaidAssets', index, -assets))
  }

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
