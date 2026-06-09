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
    expect(pool.tokenXPrice.toString()).toBe('2')
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
    expect(pool.tokenXPrice.toString()).toBe('4')
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
})
