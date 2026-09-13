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
import { getEventId, scopedId } from '../utils/id'
import { calculateDepositLiquidityAssets, mulDiv, mulDivCeil } from '../utils/math'
import { poolPriceFields } from '../utils/pool'
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

  const fees = { feeL: 0n, feeAmountX: 0n, feeAmountY: 0n }

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

    const grossX = event.params.borrowXAssets - (pool.totalAssets[BORROW_X] ?? 0n)
    const grossY = event.params.borrowYAssets - (pool.totalAssets[BORROW_Y] ?? 0n)
    const protocolInterestX = grossX > 0n ? mulDivCeil(grossX, LENDING_FEE_RATE, 100n) : 0n
    const protocolInterestY = grossY > 0n ? mulDivCeil(grossY, LENDING_FEE_RATE, 100n) : 0n

    const depositL = calculateDepositLiquidityAssets(
      event.params.reserveXAssets,
      event.params.reserveYAssets,
      event.params.depositXAssets + protocolInterestX,
      event.params.depositYAssets + protocolInterestY,
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
      grossInterestX: 0n,
      grossInterestY: 0n,
      grossInterestL: 0n,
      lpInterestL: 0n,
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
