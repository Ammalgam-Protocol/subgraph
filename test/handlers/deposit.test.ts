import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const LEND_X = '0x00000000000000000000000000000000000000d1' // DEPOSIT_X lending token
const OWNER = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const OWNER_ID = scopedId(CHAIN, OWNER)
const POSITION_ID = getPositionId(OWNER_ID, POOL_ID)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: LEND_X_ID,
    symbol: 'aTKX',
    name: 'Ammalgam TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 1, // DEPOSIT_X
  })
  const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, reserveX: 1000n, totalAssets: [1000n, 0n, 0n, 0n, 0n, 0n] })
}

describe('deposit handlers', () => {
  it('Deposit updates pool/position totals and principal', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xdep', from: OWNER },
              params: { sender: SENDER, owner: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.depositCount).toBe(1)
    expect(pool.totalAssets[1]).toBe(100n) // DEPOSIT_X
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.assets[1]).toBe(100n)
    expect(position.principal).toBe(100n)
    const deposit = await indexer.Deposit.getOrThrow(getEventId(CHAIN, '0xdep', 0))
    expect(deposit.amount).toBe(100n)
  })

  it('Withdraw decreases totals and updates position', async () => {
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
      principal: 0n,
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
              contract: 'ERC4626Deposit',
              event: 'Withdraw',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xwd', from: OWNER },
              params: { sender: SENDER, receiver: OWNER, owner: OWNER, assets: 50n, shares: 45n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.assets[1]).toBe(150n)
    expect(position.withdrawCount).toBe(1)
    // principal -= convertXToL(50, reserveX=1000, activeLiquidity=1000) = 50, from 0 -> -50
    expect(position.principal).toBe(-50n)
  })

  it('Transfer skips zero-value transfers (returns early)', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: 12, timestamp: 120 },
              transaction: { hash: '0xtr', from: OWNER },
              params: { from: SENDER, to: OWNER, value: 0n },
            },
          ],
        },
      },
    })
    const transfers = await indexer.Transfer.getAll()
    expect(transfers).toHaveLength(0)
  })
})
