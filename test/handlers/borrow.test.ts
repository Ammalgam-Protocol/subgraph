import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const DEBT_X = '0x00000000000000000000000000000000000000b1' // tokenType DEPOSIT_X (1)
const TO = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const DEBT_X_ID = scopedId(CHAIN, DEBT_X)
const TO_ID = scopedId(CHAIN, TO)
const POSITION_ID = getPositionId(TO_ID, POOL_ID)

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
  it('Borrow adds to totals and SUBTRACTS principal', async () => {
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
              transaction: { hash: '0xbor', from: TO },
              params: { sender: SENDER, to: TO, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.principal).toBe(-100n)
    expect(position.borrowCount).toBe(1)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.borrowCount).toBe(1)
  })

  it('Repay subtracts totals and ADDS principal', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    indexer.Position.set({
      id: POSITION_ID,
      user_id: TO_ID,
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
              transaction: { hash: '0xrep', from: TO },
              params: { sender: SENDER, onBehalfOf: TO, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.repayCount).toBe(1)
    expect(position.principal).toBe(0n)
  })
})
