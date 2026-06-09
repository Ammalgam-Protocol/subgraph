import { indexer } from 'envio'

import { getEventId, scopedId } from '../utils/id'
import { convertTokenToDecimal, safeDiv } from '../utils/math'
import { createDefaultUser } from '../utils/user'

indexer.onEvent({ contract: 'AmmalgamPair', event: 'Sync' }, async ({ event, context }) => {
  const poolId = scopedId(event.chainId, event.srcAddress)
  const pool = await context.Pool.get(poolId)
  if (!pool) return

  const tokenX = await context.Token.get(pool.tokenX_id)
  const tokenY = await context.Token.get(pool.tokenY_id)
  if (!tokenX || !tokenY) return

  const reserveX = convertTokenToDecimal(event.params.reserveXAssets, tokenX.decimals)
  const reserveY = convertTokenToDecimal(event.params.reserveYAssets, tokenY.decimals)

  context.Pool.set({
    ...pool,
    reserveX: event.params.reserveXAssets,
    reserveY: event.params.reserveYAssets,
    tokenXPrice: safeDiv(reserveX, reserveY),
    tokenYPrice: safeDiv(reserveY, reserveX),
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

  const amountXIn = convertTokenToDecimal(event.params.amountXIn, tokenX.decimals)
  const amountXOut = convertTokenToDecimal(event.params.amountXOut, tokenX.decimals)
  const amountYIn = convertTokenToDecimal(event.params.amountYIn, tokenY.decimals)
  const amountYOut = convertTokenToDecimal(event.params.amountYOut, tokenY.decimals)

  const amountXTotal = amountXOut.plus(amountXIn)
  const amountYTotal = amountYOut.plus(amountYIn)

  context.Token.set({
    ...tokenX,
    volume: tokenX.volume.plus(amountXTotal),
    txCount: tokenX.txCount + 1,
  })
  context.Token.set({
    ...tokenY,
    volume: tokenY.volume.plus(amountYTotal),
    txCount: tokenY.txCount + 1,
  })

  context.Pool.set({
    ...pool,
    swapCount: pool.swapCount + 1,
    txCount: pool.txCount + 1,
    volumeTokenX: pool.volumeTokenX.plus(amountXTotal),
    volumeTokenY: pool.volumeTokenY.plus(amountYTotal),
  })

  // Get or create users
  const fromId = scopedId(event.chainId, event.transaction.from!)
  let fromUser = await context.User.get(fromId)
  if (!fromUser) fromUser = createDefaultUser(fromId)
  context.User.set({ ...fromUser, swapCount: fromUser.swapCount + 1 })

  const senderId = scopedId(event.chainId, event.params.sender)
  let senderUser = await context.User.get(senderId)
  if (!senderUser) {
    senderUser = createDefaultUser(senderId)
    context.User.set(senderUser)
  }

  const toId = scopedId(event.chainId, event.params.to)
  let toUser = await context.User.get(toId)
  if (!toUser) {
    toUser = createDefaultUser(toId)
    context.User.set(toUser)
  }

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
  let borrower = await context.User.get(borrowerId)
  if (!borrower) borrower = createDefaultUser(borrowerId)
  context.User.set({ ...borrower, liquidationCount: borrower.liquidationCount + 1 })

  const liquidatorId = scopedId(event.chainId, event.params.to)
  let liquidator = await context.User.get(liquidatorId)
  if (!liquidator) {
    liquidator = createDefaultUser(liquidatorId)
    context.User.set(liquidator)
  }

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

    const reserveX = convertTokenToDecimal(event.params.reserveXAssets, tokenX.decimals)
    const reserveY = convertTokenToDecimal(event.params.reserveYAssets, tokenY.decimals)

    context.Pool.set({
      ...pool,
      reserveX: event.params.reserveXAssets,
      reserveY: event.params.reserveYAssets,
      tokenXPrice: safeDiv(reserveX, reserveY),
      tokenYPrice: safeDiv(reserveY, reserveX),
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

  context.Pool.set({
    ...pool,
    burnBadDebtCount: pool.burnBadDebtCount + 1,
  })

  const borrowerId = scopedId(event.chainId, event.params.borrower)
  let borrower = await context.User.get(borrowerId)
  if (!borrower) {
    borrower = createDefaultUser(borrowerId)
    context.User.set(borrower)
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
