import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const DEBT_X = '0x00000000000000000000000000000000000000b1' // tokenType DEPOSIT_X (1)
const OWNER = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'
const SOMEONE_ELSE = '0x5e4d000000000000000000000000000000000002'

const POOL_ID = scopedId(CHAIN, POOL)
const DEBT_X_ID = scopedId(CHAIN, DEBT_X)
const OWNER_ID = scopedId(CHAIN, OWNER)
const POSITION_ID = getPositionId(OWNER_ID, POOL_ID)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: DEBT_X_ID,
    symbol: 'dTKX',
    name: 'Debt TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 1, // DEPOSIT_X index -> principal uses convertXToL
  })
  const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, reserveX: 1000n, totalAssets: [1000n, 0n, 0n, 0n, 0n, 0n] })
}

describe('borrow handlers', () => {
  it('Borrow bumps counters and writes the entity; totals untouched', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Borrow',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xbor', from: OWNER },
              params: { sender: SENDER, to: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.borrowCount).toBe(1)
    expect(pool.txCount).toBe(1)
    expect(pool.totalAssets[1]).toBe(0n) // semantic events no longer move totals
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.borrowCount).toBe(1)
    expect(position.assets[1]).toBe(0n)
    expect(position.principal).toBe(0n)
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xbor', 0))
    expect(borrow.amount).toBe(100n)
  })

  it('Repay bumps counters and writes the entity; totals/principal untouched', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    indexer.Position.set({
      id: POSITION_ID,
      user_id: OWNER_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 200n, 0n, 0n, 0n, 0n],
      shares: [0n, 200n, 0n, 0n, 0n, 0n],
      principal: -100n,
      depositCount: 0,
      withdrawCount: 0,
      borrowCount: 0,
      repayCount: 0,
      transferredCount: 0,
      receivedCount: 0,
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Repay',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xrep', from: OWNER },
              params: { sender: SENDER, onBehalfOf: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.repayCount).toBe(1)
    expect(position.assets[1]).toBe(200n) // untouched from seed
    expect(position.principal).toBe(-100n) // untouched from seed
    const repay = await indexer.Repay.getOrThrow(getEventId(CHAIN, '0xrep', 0))
    expect(repay.amount).toBe(100n)
  })

  // burnBadDebt emits Repay with the pair as sender; the BurnBadDebt handler
  // already records the writeoff, so it must not count as user repay activity.
  it('Repay with the pair as sender skips counters but keeps the entity', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Repay',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xbad', from: OWNER },
              params: { sender: POOL, onBehalfOf: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.repayCount).toBe(0)
    expect(pool.txCount).toBe(0)
    // The Position still exists, so the writeoff stays queryable per borrower.
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.repayCount).toBe(0)
    const repay = await indexer.Repay.getOrThrow(getEventId(CHAIN, '0xbad', 0))
    expect(repay.amount).toBe(100n)
  })

  // key regression: recipient attribution is the raw on-chain param,
  // never transaction.from, even when they differ.
  it('Borrow attributes the position to params.to, not transaction.from', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Borrow',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xbrw', from: SOMEONE_ELSE },
              params: { sender: SENDER, to: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.borrowCount).toBe(1)
    const someoneElsePosition = await indexer.Position.get(
      getPositionId(scopedId(CHAIN, SOMEONE_ELSE), POOL_ID),
    )
    expect(someoneElsePosition).toBeUndefined()
  })

  // same regression for Repay's onBehalfOf param
  it('Repay attributes the position to params.onBehalfOf, not transaction.from', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Repay',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xrpo', from: SOMEONE_ELSE },
              params: { sender: SENDER, onBehalfOf: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.repayCount).toBe(1)
    const someoneElsePosition = await indexer.Position.get(
      getPositionId(scopedId(CHAIN, SOMEONE_ELSE), POOL_ID),
    )
    expect(someoneElsePosition).toBeUndefined()
  })
})
