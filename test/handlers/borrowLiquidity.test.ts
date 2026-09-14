import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const DEBT_L = '0x00000000000000000000000000000000000000b0' // BORROW_L lending token
const TO = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const DEBT_L_ID = scopedId(CHAIN, DEBT_L)
const TO_ID = scopedId(CHAIN, TO)
const POSITION_ID = getPositionId(TO_ID, POOL_ID)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: DEBT_L_ID,
    symbol: 'dLP',
    name: 'Debt LP',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 3, // BORROW_L
    pendingAssets: undefined,
    pendingShares: undefined,
  })
  const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, totalAssets: [0n, 0n, 0n, 1000n, 0n, 0n] })
}

describe('borrowLiquidity handlers', () => {
  it('BorrowLiquidity bumps counters and writes the entity; totals untouched', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xbl', from: TO },
              params: { sender: SENDER, to: TO, assets: 400n, shares: 390n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.borrowCount).toBe(1)
    expect(pool.txCount).toBe(1)
    expect(pool.totalAssets[3]).toBe(1000n) // semantic events no longer move totals
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.borrowCount).toBe(1)
    expect(position.assets[3]).toBe(0n)
    expect(position.principal).toBe(0n)
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xbl', 0))
    expect(borrow.amount).toBe(400n)
  })

  it('a pair-sender penalty accrues to penaltiesTokenL with L twins at activeBefore, bumping no user counter', async () => {
    const indexer = createTestIndexer()
    indexer.LendingToken.set({
      id: DEBT_L_ID,
      symbol: 'dLP',
      name: 'Debt LP',
      decimals: 18,
      pool_id: POOL_ID,
      tokenType: 3, // BORROW_L
      pendingAssets: undefined,
      pendingShares: undefined,
    })
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 1000n,
      reserveY: 4000n,
      totalAssets: [0n, 0n, 0n, 1000n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: 11, timestamp: 100 },
              transaction: { hash: '0xpen', from: SENDER },
              params: { sender: POOL, to: POOL, assets: 10n, shares: 10n },
            },
          ],
        },
      },
    })

    // No missing leg (no X/Y borrows seeded): activeBefore = isqrt(1000*4000) = 2000 exactly.
    // penalty 10 L -> x = 10*1000/2000 = 5, y = 10*4000/2000 = 20.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.penaltiesTokenL.toString()).toBe('10')
    expect(pool.penaltiesTokenLAsX.toString()).toBe('5')
    expect(pool.penaltiesTokenLAsY.toString()).toBe('20')
    expect(pool.borrowCount).toBe(0)
    expect(pool.txCount).toBe(0)
    expect(pool.positionCount).toBe(0)

    const pairPositionId = getPositionId(POOL_ID, POOL_ID)
    const position = await indexer.Position.getOrThrow(pairPositionId)
    expect(position.borrowCount).toBe(0)
    const pairUser = await indexer.User.getOrThrow(POOL_ID)
    expect(pairUser.borrowCount).toBe(0)
    expect(pairUser.positionCount).toBe(0)
  })

  it('RepayLiquidity attributes to the raw onBehalfOf (no rewrite) and bumps counters', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    indexer.Position.set({
      id: POSITION_ID,
      user_id: TO_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 0n, 0n, 600n, 0n, 0n],
      shares: [0n, 0n, 0n, 600n, 0n, 0n],
      principal: -600n,
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
              contract: 'ERC20DebtLiquidity',
              event: 'RepayLiquidity',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xrl', from: TO },
              params: { sender: SENDER, onBehalfOf: TO, assets: 200n, shares: 190n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.repayCount).toBe(1)
    expect(position.assets[3]).toBe(600n) // untouched from seed
    expect(position.principal).toBe(-600n) // untouched from seed
    const repay = await indexer.Repay.getOrThrow(getEventId(CHAIN, '0xrl', 0))
    expect(repay.amount).toBe(200n)
  })

  // Same bad-debt writeoff rule as borrow.test.ts, on the liquidity side.
  it('RepayLiquidity with the pair as sender skips counters but keeps the entity', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'RepayLiquidity',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xrlb', from: TO },
              params: { sender: POOL, onBehalfOf: TO, assets: 200n, shares: 190n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.repayCount).toBe(0)
    expect(pool.txCount).toBe(0)
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.repayCount).toBe(0)
    const repay = await indexer.Repay.getOrThrow(getEventId(CHAIN, '0xrlb', 0))
    expect(repay.amount).toBe(200n)
  })

  it('Transfer skips zero-value transfers (returns early)', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'Transfer',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: 12, timestamp: 120 },
              transaction: { hash: '0xtr', from: TO },
              params: { from: SENDER, to: TO, value: 0n },
            },
          ],
        },
      },
    })
    const transfers = await indexer.Transfer.getAll()
    expect(transfers).toHaveLength(0)
  })
})
