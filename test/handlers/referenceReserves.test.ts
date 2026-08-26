import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa02000000000000000000000000000000000001'
const DEPOSIT_L_TOKEN = '0xdd02000000000000000000000000000000000001'
const TX = '0xaaa0000000000000000000000000000000000003'
const TY = '0xbbb0000000000000000000000000000000000004'
const ALICE = '0xc0de000000000000000000000000000000000002'

const POOL_ID = scopedId(CHAIN, POOL)
const DEPOSIT_L_ID = scopedId(CHAIN, DEPOSIT_L_TOKEN)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  for (const [id, symbol] of [
    [scopedId(CHAIN, TX), 'TKX'],
    [scopedId(CHAIN, TY), 'TKY'],
  ] as const) {
    indexer.Token.set({
      id,
      symbol,
      name: symbol,
      decimals: 18,
      poolCount: 1,
      txCount: 0,
      volume: 0n,
      whitelistPoolIds: [],
    })
  }
  const pool = createDefaultPool(POOL_ID, scopedId(CHAIN, TX), scopedId(CHAIN, TY), 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, reserveX: 1000n, reserveY: 2000n })
  indexer.LendingToken.set({
    id: DEPOSIT_L_ID,
    symbol: 'DL',
    name: 'Deposit L',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 0,
  })
}

describe('reference reserve tracking', () => {
  it('still indexes the Mint when the reference read fails', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: DEPOSIT_L_TOKEN,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xmnt', from: ALICE },
              params: { sender: ALICE, to: ALICE, assets: 500n, shares: 500n },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.referenceReserveX).toBe(0n)
    expect(pool.referenceReserveY).toBe(0n)
    // The failed read must not swallow the action itself.
    expect(pool.depositCount).toBe(1)
  })

  it('still indexes the Swap when the reference read fails', async () => {
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
              block: { number: 12, timestamp: 120 },
              transaction: { hash: '0xswp', from: ALICE },
              params: {
                sender: ALICE,
                amountXIn: 100n,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: 190n,
                to: ALICE,
              },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // The failed read must not swallow the swap counters riding on the same Pool write.
    expect(pool.swapCount).toBe(1)
    expect(pool.volumeTokenX).toBe(100n)
  })

  it('still indexes the BurnBadDebt when the reference read fails', async () => {
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
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xbbd', from: ALICE },
              params: {
                borrower: ALICE,
                tokenType: 3n,
                badDebtAssets: 10n,
                badDebtShares: 10n,
              },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.burnBadDebtCount).toBe(1)
  })
})

describe('Sync reference reserve observation', () => {
  it('carries null reference fields and still indexes the Sync when the read fails', async () => {
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
              block: { number: 13, timestamp: 130 },
              transaction: { hash: '0xsyn', from: ALICE },
              params: { reserveXAssets: 1100n, reserveYAssets: 2100n },
            },
          ],
        },
      },
    })

    const syncs = await indexer.Sync.getAll()
    expect(syncs).toHaveLength(1)
    // The key must be present even when null: its absence means the handler never
    // reached the observation, which is the regression this guards.
    expect('referenceReserveX' in syncs[0]).toBe(true)
    expect(syncs[0].referenceReserveX).toBeUndefined()
    expect(syncs[0].referenceReserveY).toBeUndefined()

    // A failed read must not swallow the Sync's own pool write.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.syncCount).toBe(1)
    expect(pool.reserveX).toBe(1100n)
    expect(pool.referenceReserveX).toBe(0n)
  })
})
