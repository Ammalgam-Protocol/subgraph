import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { getEventId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'
import { lendingTokensCreatedRegistration, testBlockNumber } from './testBlock'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const DEBT_X = '0x00000000000000000000000000000000000000b4'
const DEBT_L = '0x00000000000000000000000000000000000000b3'
const OWNER = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'
const UNUSED_LEND_1 = '0x00000000000000000000000000000000000000e1'
const UNUSED_LEND_2 = '0x00000000000000000000000000000000000000e2'
const UNUSED_LEND_3 = '0x00000000000000000000000000000000000000e3'

const POOL_ID = scopedId(CHAIN, POOL)

// principal 2e18 carries fee ceil(2e18 * 5 / 10000) = 1e15; amount is post-fee.
const PRINCIPAL = 2000000000000000000n
const FEE = 1000000000000000n
const AMOUNT = PRINCIPAL + FEE

async function seed(indexer: ReturnType<typeof createTestIndexer>) {
  await indexer.process({
    chains: {
      11155111: {
        simulate: [
          lendingTokensCreatedRegistration({
            pair: POOL,
            depositL: UNUSED_LEND_1,
            depositX: UNUSED_LEND_2,
            depositY: UNUSED_LEND_3,
            borrowL: DEBT_L,
            borrowX: DEBT_X,
            borrowY: UNUSED_LEND_1,
          }),
        ],
      },
    },
  })
  indexer.Pool.set(createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n))
}

describe('lending fee derivation', () => {
  it('records the initial lending fee on a Borrow row and the pool aggregates', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Borrow',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    expect(pool.initialLendingFeesTokenX).toBe(FEE)
    expect(pool.initialLendingFeesTokenL).toBe(0n)
    expect(dayData.initialLendingFeesTokenX).toBe(FEE)
  })

  it('records the initial lending fee on a BorrowLiquidity row and the pool aggregates', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    expect(pool.initialLendingFeesTokenL).toBe(FEE)
    expect(pool.initialLendingFeesTokenX).toBe(0n)
    expect(dayData.initialLendingFeesTokenL).toBe(FEE)
  })

  // Penalties reach this handler as pair-sender BorrowLiquidity with no 5-bip fee;
  // AMOUNT is still invertible, so an unguarded handler would wrongly report a fee.
  it('records a pair-sender BorrowLiquidity as a penalty with no lending fee', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: DEBT_L,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
  })

  // mintPenalties only mints BORROW_L, so tokenX/tokenY debt has no penalty path at all.
  it('never flags a Borrow as a penalty, even when the pair is the sender', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Borrow',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
  })

  it('leaves lendingFee null when no principal solves the fee equation', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Borrow',
              srcAddress: DEBT_X,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
  })
})
