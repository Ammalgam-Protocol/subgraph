import { BigDecimal, createTestIndexer } from 'envio'
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
    volume: new BigDecimal('0'),
    whitelistPoolIds: [],
  })
  indexer.Token.set({
    id: TY_ID,
    symbol: 'TKY',
    name: 'Token Y',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: new BigDecimal('0'),
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
    seed(indexer)
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

  it('BurnBadDebt BORROW_L decrements DEPOSIT_L directly', async () => {
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
    expect(pool.totalAssets[0]).toBe(650n)
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
