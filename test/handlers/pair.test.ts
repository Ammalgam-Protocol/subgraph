import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const TX = '0xaaa0000000000000000000000000000000000001'
const TY = '0xbbb0000000000000000000000000000000000002'
const FROM = '0xf00d000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'
const TO = '0x7000000000000000000000000000000000000001'
const BORROWER = '0xb00b000000000000000000000000000000000001'
const LIQUIDATOR = '0x11c0000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const TX_ID = scopedId(CHAIN, TX)
const TY_ID = scopedId(CHAIN, TY)
const FROM_ID = scopedId(CHAIN, FROM)
const SENDER_ID = scopedId(CHAIN, SENDER)
const TO_ID = scopedId(CHAIN, TO)
const BORROWER_ID = scopedId(CHAIN, BORROWER)
const LIQUIDATOR_ID = scopedId(CHAIN, LIQUIDATOR)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.Token.set({
    id: TX_ID,
    symbol: 'TKX',
    name: 'Token X',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
  indexer.Token.set({
    id: TY_ID,
    symbol: 'TKY',
    name: 'Token Y',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
  indexer.Pool.set({ ...createDefaultPool(POOL_ID, TX_ID, TY_ID, 'TKX-TKY', 1n, 1n) })
}

function seedPool(
  indexer: ReturnType<typeof createTestIndexer>,
  overrides: { totalAssets?: bigint[]; reserveX?: bigint; reserveY?: bigint },
) {
  seed(indexer)
  indexer.Pool.set({
    ...createDefaultPool(POOL_ID, TX_ID, TY_ID, 'TKX-TKY', 1n, 1n),
    ...overrides,
  })
}

describe('pair handlers', () => {
  it('Sync updates reserves, prices, and creates a Sync entity', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xsync', from: FROM },
              params: { reserveXAssets: 2000n, reserveYAssets: 1000n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.reserveX).toBe(2000n)
    expect(pool.reserveY).toBe(1000n)
    expect(pool.syncCount).toBe(1)
    expect(pool.tokenXPrice.toString()).toBe('0.5')
    const sync = await indexer.Sync.getOrThrow(getEventId(CHAIN, '0xsync', 0))
    expect(sync.reserveX).toBe(2000n)
  })

  it('Swap updates volume, counts, and creates Swap + Users', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, { reserveX: 1000n, reserveY: 1000n })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 1,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xswap', from: FROM },
              params: {
                sender: SENDER,
                to: TO,
                amountXIn: 100n,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: 50n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.swapCount).toBe(1)
    expect(pool.txCount).toBe(1)
    const swap = await indexer.Swap.getOrThrow(getEventId(CHAIN, '0xswap', 1))
    expect(swap.sender_id).toBe(SENDER_ID)
    expect(swap.to_id).toBe(TO_ID)
    expect(swap.from_id).toBe(FROM_ID)
    // pre=(1000,1000) -> 1000; post=(1100,950) -> isqrt(1045000)=1022 -> feeL=22
    // feeAmountX = 2*22*calculateSwapFeeReserve(1100,0)/1022 = 48400/1022 = 47
    expect(swap.feeL).toBe(22n)
    expect(swap.feeAmountX).toBe(47n)
    expect(swap.feeAmountY).toBe(0n)
    const fromUser = await indexer.User.getOrThrow(FROM_ID)
    expect(fromUser.swapCount).toBe(1)
  })

  it('Liquidate records the event, bumps counts, and tracks the borrower', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Liquidate',
              srcAddress: POOL,
              logIndex: 2,
              block: { number: 12, timestamp: 120 },
              transaction: { hash: '0xliq', from: FROM },
              params: {
                borrower: BORROWER,
                to: LIQUIDATOR,
                seizedLAssets: 10n,
                seizedXAssets: 20n,
                seizedYAssets: 30n,
                repayXAssets: 40n,
                repayYAssets: 50n,
                actualRepaidXAssets: 45n,
                actualRepaidYAssets: 55n,
                liquidationType: 1n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.liquidateCount).toBe(1)
    expect(pool.txCount).toBe(1)
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, '0xliq', 2))
    expect(liq.borrower_id).toBe(BORROWER_ID)
    expect(liq.liquidator_id).toBe(LIQUIDATOR_ID)
    expect(liq.seizedXAssets).toBe(20n)
    expect(liq.liquidationType).toBe(1n)
    const borrower = await indexer.User.getOrThrow(BORROWER_ID)
    expect(borrower.liquidationCount).toBe(1)
  })

  it('InterestAccrued refreshes reserves/prices and records the event', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 3,
              block: { number: 13, timestamp: 130 },
              transaction: { hash: '0xint', from: FROM },
              params: {
                reserveXAssets: 4000n,
                reserveYAssets: 1000n,
                depositXAssets: 100n,
                depositYAssets: 200n,
                borrowLAssets: 300n,
                borrowXAssets: 400n,
                borrowYAssets: 500n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.reserveX).toBe(4000n)
    expect(pool.reserveY).toBe(1000n)
    expect(pool.interestAccruedCount).toBe(1)
    expect(pool.tokenXPrice.toString()).toBe('0.25')
    expect(pool.tokenYPrice.toString()).toBe('4')
    const ia = await indexer.InterestAccrued.getOrThrow(getEventId(CHAIN, '0xint', 3))
    expect(ia.borrowLAssets).toBe(300n)
    expect(ia.depositXAssets).toBe(100n)
  })

  it('BurnBadDebt records the event and bumps the count', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'BurnBadDebt',
              srcAddress: POOL,
              logIndex: 4,
              block: { number: 14, timestamp: 140 },
              transaction: { hash: '0xbbd', from: FROM },
              params: {
                borrower: BORROWER,
                tokenType: 4n,
                badDebtAssets: 700n,
                badDebtShares: 650n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.burnBadDebtCount).toBe(1)
    const bbd = await indexer.BurnBadDebt.getOrThrow(getEventId(CHAIN, '0xbbd', 4))
    expect(bbd.borrower_id).toBe(BORROWER_ID)
    expect(bbd.tokenType).toBe(4n)
    expect(bbd.badDebtAssets).toBe(700n)
  })

  it('InterestAccrued snapshots all 6 totalAssets including derived depositL', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, { totalAssets: [999n, 999n, 999n, 999n, 999n, 999n] })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 20, timestamp: 200 },
              transaction: { hash: '0xint2', from: FROM },
              params: {
                reserveXAssets: 400n,
                reserveYAssets: 900n,
                depositXAssets: 500n,
                depositYAssets: 600n,
                borrowLAssets: 100n,
                borrowXAssets: 200n,
                borrowYAssets: 50n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // missingX = 0, missingY = 0 -> activeL = isqrt(400*900) = 600; depositL = 600 + 100
    expect(pool.totalAssets).toEqual([700n, 500n, 600n, 100n, 200n, 50n])
    expect(pool.reserveX).toBe(400n)
  })

  it('InterestAccrued re-derives DEPOSIT_L fee-inclusive (D10)', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, { totalAssets: [999n, 0n, 0n, 0n, 100n, 200n] })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 27, timestamp: 270 },
              transaction: { hash: '0xintfee', from: FROM },
              params: {
                reserveXAssets: 50n,
                reserveYAssets: 200n,
                depositXAssets: 100n,
                depositYAssets: 1000n,
                borrowLAssets: 0n,
                // gross X = 150 - 100(pre) = 50 -> protocolInterestX = ceil(50*10/100) = 5
                borrowXAssets: 150n,
                // gross Y = 200 - 200(pre) = 0 -> protocolInterestY = 0
                borrowYAssets: 200n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // fee-inclusive: missingX = 150-(100+5) = 45, not depleted -> reserveAdjustment(50,45) = 50 ->
    // depositL = isqrt(50*200) = 100. Ignoring the fee gives depositL = 0, so 100 proves it counted.
    expect(pool.totalAssets[0]).toBe(100n)
  })

  it('InterestAccrued writes gross, protocol, and lp interest with L twins to Pool and PoolDayData', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [500n, 100n, 200n, 50n, 150n, 300n],
      reserveX: 1000n,
      reserveY: 2000n,
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 30, timestamp: 100000 },
              transaction: { hash: '0xintl1', from: FROM },
              params: {
                reserveXAssets: 1100n,
                reserveYAssets: 2100n,
                depositXAssets: 100n,
                depositYAssets: 200n,
                // gross L = 60 - 50(pre) = 10; protocolInterestL = ceil(10 * 10%) = 1, same rate as X/Y.
                borrowLAssets: 60n,
                // gross X = 165 - 150(pre) = 15 -> protocolInterestX = ceil(15*10/100) = 2
                borrowXAssets: 165n,
                // gross Y = 320 - 300(pre) = 20 -> protocolInterestY = ceil(20*10/100) = 2
                borrowYAssets: 320n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.grossInterestTokenX).toBe(15n)
    expect(pool.grossInterestTokenY).toBe(20n)
    expect(pool.grossInterestTokenL).toBe(10n)
    expect(pool.protocolInterestTokenX).toBe(2n)
    expect(pool.protocolInterestTokenY).toBe(2n)
    expect(pool.protocolInterestTokenL).toBe(1n)
    // activeLiquidityAssetsBefore = isqrt(1000*2000) = 1414 (pre-state missing: X=50, Y=100).
    // activeLiquidityAssetsAfter = depositL(1579) - borrowLAssets(60) = 1519.
    // lpInterestL = 1519 - 1414 = 105, the reserve share of X/Y interest stored in L.
    expect(pool.lpInterestTokenL).toBe(105n)
    // L twins convert at activeLiquidityAssetsAfter(1519) and the event's own reserves.
    expect(pool.grossInterestTokenLAsX).toBe(7n)
    expect(pool.grossInterestTokenLAsY).toBe(13n)
    expect(pool.protocolInterestTokenLAsX).toBe(0n)
    expect(pool.protocolInterestTokenLAsY).toBe(1n)
    expect(pool.lpInterestTokenLAsX).toBe(76n)
    expect(pool.lpInterestTokenLAsY).toBe(145n)

    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-86400`)
    expect(dayData.grossInterestTokenX).toBe(15n)
    expect(dayData.protocolInterestTokenL).toBe(1n)
    expect(dayData.lpInterestTokenLAsY).toBe(145n)
  })

  it('InterestAccrued: protocolInterestToken* never exceeds grossInterestToken*', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [500n, 100n, 200n, 50n, 150n, 300n],
      reserveX: 1000n,
      reserveY: 2000n,
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 30, timestamp: 100000 },
              transaction: { hash: '0xintl2', from: FROM },
              params: {
                reserveXAssets: 1100n,
                reserveYAssets: 2100n,
                depositXAssets: 100n,
                depositYAssets: 200n,
                borrowLAssets: 60n,
                borrowXAssets: 165n,
                borrowYAssets: 320n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolInterestTokenX <= pool.grossInterestTokenX).toBe(true)
    expect(pool.protocolInterestTokenY <= pool.grossInterestTokenY).toBe(true)
    expect(pool.protocolInterestTokenL <= pool.grossInterestTokenL).toBe(true)
  })

  it('InterestAccrued: zero-interest accrual writes zeros, not nulls', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [500n, 100n, 200n, 50n, 150n, 300n],
      reserveX: 1000n,
      reserveY: 2000n,
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 30, timestamp: 100000 },
              transaction: { hash: '0xintl3', from: FROM },
              params: {
                // Reserves and borrows match the pre-state exactly: no interest accrued.
                reserveXAssets: 1000n,
                reserveYAssets: 2000n,
                depositXAssets: 100n,
                depositYAssets: 200n,
                borrowLAssets: 50n,
                borrowXAssets: 150n,
                borrowYAssets: 300n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.grossInterestTokenX).toBe(0n)
    expect(pool.grossInterestTokenY).toBe(0n)
    expect(pool.grossInterestTokenL).toBe(0n)
    expect(pool.protocolInterestTokenX).toBe(0n)
    expect(pool.protocolInterestTokenY).toBe(0n)
    expect(pool.protocolInterestTokenL).toBe(0n)
    expect(pool.lpInterestTokenL).toBe(0n)
    expect(pool.grossInterestTokenLAsX).toBe(0n)
    expect(pool.lpInterestTokenLAsY).toBe(0n)
    expect(pool.protocolInterestTokenLAsX).toBe(0n)
    expect(pool.protocolInterestTokenLAsY).toBe(0n)
  })

  it('InterestAccrued rounds protocol L interest up on a remainder', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [1000n, 500n, 500n, 0n, 0n, 0n],
      reserveX: 1000n,
      reserveY: 1000n,
    })

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 31, timestamp: 100100 },
              transaction: { hash: '0xintl4', from: FROM },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 11n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // gross L 11 rounds up: ceil(11 * 10%) = 2, not floor's 1.
    expect(pool.grossInterestTokenL).toBe(11n)
    expect(pool.protocolInterestTokenL).toBe(2n)
    expect(pool.protocolInterestTokenLAsX).toBe(2n)
    expect(pool.protocolInterestTokenLAsY).toBe(2n)
  })

  it('InterestAccrued rounds each same-day accrual before accumulation', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [1000n, 500n, 500n, 0n, 0n, 0n],
      reserveX: 1000n,
      reserveY: 1000n,
    })
    const block = { number: 32, timestamp: 100200 }

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block,
              transaction: { hash: '0xintl5', from: FROM },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 1n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 1,
              block,
              transaction: { hash: '0xintl5', from: FROM },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 2n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-86400`)
    // Two same-day accruals of gross L 1 each round independently: ceil(1*10%) twice = 2, not
    // ceil(2*10%) = 1 if summed first.
    expect(pool.grossInterestTokenL).toBe(2n)
    expect(pool.protocolInterestTokenL).toBe(2n)
    expect(dayData.grossInterestTokenL).toBe(2n)
    expect(dayData.protocolInterestTokenL).toBe(2n)
  })

  it('InterestAccrued reconciles independently rounded accruals across UTC days', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [1000n, 500n, 500n, 0n, 0n, 0n],
      reserveX: 1000n,
      reserveY: 1000n,
    })

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 40, timestamp: 86399 },
              transaction: { hash: '0xday1', from: FROM },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 11n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 41, timestamp: 86400 },
              transaction: { hash: '0xday2', from: FROM },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 30n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const day0 = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    const day86400 = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-86400`)
    const firstAccrual = await indexer.InterestAccrued.getOrThrow(getEventId(CHAIN, '0xday1', 0))
    const secondAccrual = await indexer.InterestAccrued.getOrThrow(getEventId(CHAIN, '0xday2', 0))

    // Day 0 gross L 11 -> protocol 2; day 86400's additional gross L 19 -> protocol 2
    // independently; pool sums to gross 30, protocol 4.
    expect(firstAccrual.grossInterestL).toBe(11n)
    expect(secondAccrual.grossInterestL).toBe(19n)
    expect(day0.grossInterestTokenL).toBe(11n)
    expect(day0.protocolInterestTokenL).toBe(2n)
    expect(day86400.grossInterestTokenL).toBe(19n)
    expect(day86400.protocolInterestTokenL).toBe(2n)
    expect(pool.grossInterestTokenL).toBe(30n)
    expect(pool.protocolInterestTokenL).toBe(4n)
    expect(day0.grossInterestTokenL + day86400.grossInterestTokenL).toBe(pool.grossInterestTokenL)
    expect(day0.protocolInterestTokenL + day86400.protocolInterestTokenL).toBe(
      pool.protocolInterestTokenL,
    )
  })

  it('InterestAccrued: a negative borrow delta clamps gross interest at 0', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, {
      totalAssets: [500n, 100n, 200n, 50n, 150n, 300n],
      reserveX: 1000n,
      reserveY: 2000n,
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 30, timestamp: 100000 },
              transaction: { hash: '0xintl4', from: FROM },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 2000n,
                depositXAssets: 100n,
                depositYAssets: 200n,
                borrowLAssets: 50n,
                // borrowXAssets(140) < pre totalAssets[BORROW_X](150): a would-be-negative gross.
                borrowXAssets: 140n,
                borrowYAssets: 300n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.grossInterestTokenX).toBe(0n)
    expect(pool.protocolInterestTokenX).toBe(0n)
  })

  it('Sync recomputes totalAssets[DEPOSIT_L] from new reserves (D10)', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, { totalAssets: [700n, 500n, 600n, 100n, 200n, 50n] })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 21, timestamp: 210 },
              transaction: { hash: '0xsync2', from: FROM },
              params: { reserveXAssets: 1600n, reserveYAssets: 900n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // missing 0/0 -> activeL = isqrt(1600*900) = 1200 -> depositL = 1300
    expect(pool.totalAssets[0]).toBe(1300n)
    expect(pool.totalAssets.slice(1)).toEqual([500n, 600n, 100n, 200n, 50n])
  })

  it('BurnBadDebt BORROW_X applies the deposit-side haircut', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, { reserveX: 1000n, totalAssets: [0n, 900n, 0n, 0n, 500n, 0n] })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'BurnBadDebt',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 22, timestamp: 220 },
              transaction: { hash: '0xbbdx', from: FROM },
              params: {
                borrower: BORROWER,
                tokenType: 4n,
                badDebtAssets: 190n,
                badDebtShares: 190n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // burnReserves = mulDiv(190, 1000, 900+1000) = 100 -> DEPOSIT_X -= (190-100) = 810
    expect(pool.totalAssets[1]).toBe(810n)
    expect(pool.reserveX).toBe(1000n)
  })

  it('BurnBadDebt on BORROW_L touches neither BORROW_L nor DEPOSIT_L directly (D10)', async () => {
    const indexer = createTestIndexer()
    seedPool(indexer, { totalAssets: [700n, 0n, 0n, 300n, 0n, 0n] })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'BurnBadDebt',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 23, timestamp: 230 },
              transaction: { hash: '0xbbdl', from: FROM },
              params: {
                borrower: BORROWER,
                tokenType: 3n,
                badDebtAssets: 50n,
                badDebtShares: 50n,
              },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // The preceding Transfer burn (not fired here) lands the BORROW_L decrement and re-derives
    // DEPOSIT_L; this branch touches neither.
    expect(pool.totalAssets[0]).toBe(700n)
    expect(pool.totalAssets[3]).toBe(300n)
  })

  it('UpdateExternalLiquidity stores the value', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'UpdateExternalLiquidity',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 24, timestamp: 240 },
              transaction: { hash: '0xext', from: FROM },
              params: { externalLiquidity: 777n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.externalLiquidity).toBe(777n)
  })
})
