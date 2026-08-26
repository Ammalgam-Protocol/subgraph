import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const DEBT_X = '0x00000000000000000000000000000000000000b4'
const DEBT_L = '0x00000000000000000000000000000000000000b3'
const OWNER = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const DEBT_X_ID = scopedId(CHAIN, DEBT_X)
const DEBT_L_ID = scopedId(CHAIN, DEBT_L)

// principal 2e18 carries fee ceil(2e18 * 5 / 10000) = 1e15; amount is post-fee.
const PRINCIPAL = 2000000000000000000n
const FEE = 1000000000000000n
const AMOUNT = PRINCIPAL + FEE

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: DEBT_X_ID,
    symbol: 'dTKX',
    name: 'Debt TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 4, // BORROW_X
  })
  indexer.LendingToken.set({
    id: DEBT_L_ID,
    symbol: 'dAMG',
    name: 'Debt Liquidity',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 3, // BORROW_L
  })
  indexer.Pool.set(createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n))
}

describe('lending fee derivation', () => {
  it('Borrow splits out the fee and accrues lendingFeesTokenX', async () => {
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
              transaction: { hash: '0xlf1', from: OWNER },
              params: { sender: SENDER, to: OWNER, assets: AMOUNT, shares: 1n },
            },
          ],
        },
      },
    })
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xlf1', 0))
    expect(borrow.lendingFee).toBe(FEE)
    expect(borrow.isPenalty).toBe(false)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.lendingFeesTokenX.toString()).toBe('1000000000000000')
    expect(pool.penaltiesAccrued.toString()).toBe('0')
    expect(pool.lendingFeesTokenY.toString()).toBe('0')
    expect(pool.lendingFeesTokenL.toString()).toBe('0')
  })

  it('BorrowLiquidity routes into lendingFeesTokenL', async () => {
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
              transaction: { hash: '0xlf2', from: OWNER },
              params: { sender: SENDER, to: OWNER, assets: AMOUNT, shares: 1n },
            },
          ],
        },
      },
    })
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xlf2', 0))
    expect(borrow.lendingFee).toBe(FEE)
    expect(borrow.isPenalty).toBe(false)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.lendingFeesTokenL.toString()).toBe('1000000000000000')
    expect(pool.lendingFeesTokenX.toString()).toBe('0')
    expect(pool.penaltiesAccrued.toString()).toBe('0')
  })

  // Penalties reach this handler as pair-sender BorrowLiquidity with no 5-bip fee;
  // AMOUNT is still invertible, so an unguarded handler would wrongly report a fee.
  it('records a pair-sender BorrowLiquidity as a penalty with no lending fee', async () => {
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
              transaction: { hash: '0xlf4', from: OWNER },
              params: { sender: POOL, to: POOL, assets: AMOUNT, shares: 1n },
            },
          ],
        },
      },
    })
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xlf4', 0))
    expect(borrow.isPenalty).toBe(true)
    expect(borrow.lendingFee).toBeUndefined()
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.lendingFeesTokenL.toString()).toBe('0')
    expect(pool.lendingFeesTokenX.toString()).toBe('0')
    expect(pool.penaltiesAccrued.toString()).toBe('2001000000000000000')
  })

  it('keeps a Position for the pair without counting the penalty as a borrow', async () => {
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
              transaction: { hash: '0xlf6', from: OWNER },
              params: { sender: POOL, to: POOL, assets: AMOUNT, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.borrowCount).toBe(0)
    expect(pool.txCount).toBe(0)
    expect(pool.positionCount).toBe(1) // sanity: the Position is still written
    expect(pool.penaltiesAccrued.toString()).toBe('2001000000000000000') // sanity: not vacuous

    const position = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(position.borrowCount).toBe(0)
    const user = await indexer.User.getOrThrow(POOL_ID)
    expect(user.borrowCount).toBe(0)
    expect(user.positionCount).toBe(1)
  })

  // mintPenalties only mints BORROW_L, so tokenX/tokenY debt has no penalty path at all.
  it('never flags a Borrow as a penalty, even when the pair is the sender', async () => {
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
              transaction: { hash: '0xlf5', from: OWNER },
              params: { sender: POOL, to: POOL, assets: AMOUNT, shares: 1n },
            },
          ],
        },
      },
    })
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xlf5', 0))
    expect(borrow.isPenalty).toBe(false)
    expect(borrow.lendingFee).toBe(FEE)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.lendingFeesTokenX.toString()).toBe('1000000000000000')
    expect(pool.penaltiesAccrued.toString()).toBe('0')
  })

  it('leaves lendingFee null and accrues nothing when no principal solves the fee equation', async () => {
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
              transaction: { hash: '0xlf3', from: OWNER },
              // amount 1 is unreachable under the 5-bip formula (0 -> 0, 1 -> 2).
              params: { sender: SENDER, to: OWNER, assets: 1n, shares: 1n },
            },
          ],
        },
      },
    })
    const borrow = await indexer.Borrow.getOrThrow(getEventId(CHAIN, '0xlf3', 0))
    expect(borrow.lendingFee).toBeUndefined()
    expect(borrow.isPenalty).toBe(false)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.lendingFeesTokenX.toString()).toBe('0')
    expect(pool.lendingFeesTokenL.toString()).toBe('0')
    expect(pool.penaltiesAccrued.toString()).toBe('0')
  })
})
