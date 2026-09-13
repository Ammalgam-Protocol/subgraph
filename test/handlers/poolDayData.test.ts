import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

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
  indexer.Pool.set({
    ...createDefaultPool(POOL_ID, TX_ID, TY_ID, 'TKX-TKY', 1n, 1n),
    reserveX: 1000n,
    reserveY: 1000n,
  })
}

describe('PoolDayData: one write path for yield', () => {
  it('creates the day row on first touch with every fee column at ZERO_BI', async () => {
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
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
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
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
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

  it('lands two accruals across a UTC midnight in two day rows summing to Pool', async () => {
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
              logIndex: 0,
              block: { number: 10, timestamp: 86399 },
              transaction: { hash: '0xswapA', from: FROM },
              params: {
                sender: SENDER,
                to: TO,
                amountXIn: 100n,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: 50n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 1,
              block: { number: 11, timestamp: 86400 + 10 },
              transaction: { hash: '0xswapB', from: FROM },
              params: {
                sender: SENDER,
                to: TO,
                amountXIn: 300n,
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
    const dayA = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    const dayB = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-86400`)

    expect(dayA.volumeTokenX.toString()).toBe('100')
    expect(dayB.volumeTokenX.toString()).toBe('300')
    expect(dayA.swapCount).toBe(1)
    expect(dayB.swapCount).toBe(1)

    expect(dayA.volumeTokenX + dayB.volumeTokenX).toBe(pool.volumeTokenX)
    expect(dayA.swapCount + dayB.swapCount).toBe(pool.swapCount)
    expect(dayA.txCount + dayB.txCount).toBe(pool.txCount)
  })
})
