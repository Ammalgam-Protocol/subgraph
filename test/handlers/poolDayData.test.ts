import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { getEventId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'
import { pairCreatedRegistration, testBlockNumber } from './testBlock'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const TX = '0xaaa0000000000000000000000000000000000001'
const TY = '0xbbb0000000000000000000000000000000000002'
const FROM = '0xf00d000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'
const TO = '0x7000000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const TX_ID = scopedId(CHAIN, TX)
const TY_ID = scopedId(CHAIN, TY)

async function seed(indexer: ReturnType<typeof createTestIndexer>) {
  await indexer.process({
    chains: {
      11155111: {
        simulate: [pairCreatedRegistration({ pair: POOL, tokenX: TX, tokenY: TY })],
      },
    },
  })
  indexer.Pool.set({
    ...createDefaultPool(POOL_ID, TX_ID, TY_ID, 'TKX-TKY', 1n, 1n),
    reserveX: 1000n,
    reserveY: 1000n,
  })
}

describe('PoolDayData: one write path for yield', () => {
  it('creates the day row on first touch with every fee column at ZERO_BI', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
              transaction: { hash: '0xswap1', from: FROM },
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

    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    expect(dayData.pool_id).toBe(POOL_ID)
    expect(dayData.date).toBe(0)
    // Untouched by a Swap: still the zeroed default from creation, not undefined/missing.
    expect(dayData.protocolFeesTokenX.toString()).toBe('0')
    expect(dayData.penaltiesTokenL.toString()).toBe('0')
    expect(dayData.grossInterestTokenL.toString()).toBe('0')
  })

  it('applies one delta object to both Pool and the day row', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
              transaction: { hash: '0xswap1', from: FROM },
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
    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    expect(pool.swapCount).toBe(1)
    expect(pool.txCount).toBe(1)
    expect(pool.volumeTokenX.toString()).toBe('100')
    expect(dayData.swapCount).toBe(pool.swapCount)
    expect(dayData.txCount).toBe(pool.txCount)
    expect(dayData.volumeTokenX).toBe(pool.volumeTokenX)
  })

  it('reconciles fee-bearing swaps across UTC days with events and Pool', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 86399 },
              transaction: { hash: '0xswapa', from: FROM },
              params: {
                sender: SENDER,
                to: TO,
                amountXIn: 10n,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: 6n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 1,
              block: { number: testBlockNumber(10), timestamp: 86399 },
              transaction: { hash: '0xswapa', from: FROM },
              params: { reserveXAssets: 1010n, reserveYAssets: 994n },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(11), timestamp: 86400 + 10 },
              transaction: { hash: '0xswapb', from: FROM },
              params: {
                sender: SENDER,
                to: TO,
                amountXIn: 10n,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: 5n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 1,
              block: { number: testBlockNumber(11), timestamp: 86400 + 10 },
              transaction: { hash: '0xswapb', from: FROM },
              params: { reserveXAssets: 1020n, reserveYAssets: 989n },
            },
          ],
        },
      },
    })

    const swapA = await indexer.Swap.getOrThrow(getEventId(CHAIN, '0xswapa', 0))
    const swapB = await indexer.Swap.getOrThrow(getEventId(CHAIN, '0xswapb', 0))
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const dayA = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    const dayB = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-86400`)

    expect(swapA.feeAmountX).toBe(3n)
    expect(swapA.feeL).toBe(1n)
    expect(swapB.feeAmountX).toBe(4n)
    expect(swapB.feeL).toBe(3n)
    expect(dayA.swapFeesTokenX).toBe(swapA.feeAmountX)
    expect(dayA.swapFeesTokenL).toBe(swapA.feeL)
    expect(dayB.swapFeesTokenX).toBe(swapB.feeAmountX)
    expect(dayB.swapFeesTokenL).toBe(swapB.feeL)
    expect(dayA.swapFeesTokenX + dayB.swapFeesTokenX).toBe(pool.swapFeesTokenX)
    expect(dayA.swapFeesTokenL + dayB.swapFeesTokenL).toBe(pool.swapFeesTokenL)
    expect(pool.swapFeesTokenX).toBe(7n)
    expect(pool.swapFeesTokenL).toBe(4n)
    expect(dayA.swapCount + dayB.swapCount).toBe(pool.swapCount)
    expect(dayA.txCount + dayB.txCount).toBe(pool.txCount)
  })
})
