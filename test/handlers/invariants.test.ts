import { BigDecimal, createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getPositionId, scopedId } from '../../src/utils/id'
import { toAssets } from '../../src/utils/math'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL: `0x${string}` = '0xaa01000000000000000000000000000000000001'
const TX: `0x${string}` = '0xaaa0000000000000000000000000000000000001'
const TY: `0x${string}` = '0xbbb0000000000000000000000000000000000002'
const LEND_X: `0x${string}` = '0x00000000000000000000000000000000000000d1'
const LEND_BX: `0x${string}` = '0x00000000000000000000000000000000000000d4'
const ALICE: `0x${string}` = '0xc0de000000000000000000000000000000000001'
const BOB: `0x${string}` = '0xc0de000000000000000000000000000000000002'
const FEE_TO: `0x${string}` = '0xfee0000000000000000000000000000000000001'
const ZERO: `0x${string}` = '0x0000000000000000000000000000000000000000'

const POOL_ID = scopedId(CHAIN, POOL)
const TX_ID = scopedId(CHAIN, TX)
const TY_ID = scopedId(CHAIN, TY)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const LEND_BX_ID = scopedId(CHAIN, LEND_BX)
const ALICE_ID = scopedId(CHAIN, ALICE)
const BOB_ID = scopedId(CHAIN, BOB)

function seedLendingToken(
  indexer: ReturnType<typeof createTestIndexer>,
  id: string,
  poolId: string,
  tokenType: number,
) {
  indexer.LendingToken.set({
    id,
    symbol: 'aTK',
    name: 'Ammalgam TK',
    decimals: 18,
    pool_id: poolId,
    tokenType,
  })
}

function seedPool(
  indexer: ReturnType<typeof createTestIndexer>,
  overrides?: Partial<{ totalAssets: bigint[]; totalShares: bigint[] }>,
) {
  const pool = createDefaultPool(POOL_ID, TX_ID, TY_ID, 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, ...overrides })
}

function depositTransfer(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: 10, timestamp: 100 },
) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_X,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

function debtTransfer(from: `0x${string}`, to: `0x${string}`, value: bigint, logIndex: number) {
  return {
    contract: 'ERC4626Debt' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_BX,
    logIndex,
    block: { number: 10, timestamp: 100 },
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

describe('cross-handler invariants and sequences', () => {
  it('reconstruction invariant holds across mint/mint/move/burn', async () => {
    const indexer = createTestIndexer()
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            depositTransfer(ZERO, ALICE, 100n, 0),
            depositTransfer(ZERO, BOB, 50n, 1),
            depositTransfer(ALICE, BOB, 30n, 2),
            depositTransfer(BOB, ZERO, 20n, 3),
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const positions = await indexer.Position.getAll()
    for (let t = 0; t < 6; t++) {
      const sum = positions.reduce((acc, p) => acc + (p.shares[t] ?? 0n), 0n)
      expect(sum).toBe(pool.totalShares[t])
    }
    // sanity: not a vacuous all-zero check
    expect(pool.totalShares[1]).toBe(130n)
  })

  it('facade debt-token mint-then-forward attributes shares to the final recipient', async () => {
    const indexer = createTestIndexer()
    seedLendingToken(indexer, LEND_BX_ID, POOL_ID, 4)
    seedPool(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [debtTransfer(ZERO, LEND_BX, 100n, 0), debtTransfer(LEND_BX, ALICE, 100n, 1)],
        },
      },
    })
    const alice = await indexer.Position.getOrThrow(getPositionId(ALICE_ID, POOL_ID))
    expect(alice.shares[4]).toBe(100n)
    const intermediary = await indexer.Position.getOrThrow(getPositionId(LEND_BX_ID, POOL_ID))
    expect(intermediary.shares[4]).toBe(0n)
  })

  it('protocol-fee mint after InterestAccrued reconstructs via snapshot-then-delta', async () => {
    const indexer = createTestIndexer()
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
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    const seededShares = 200n
    seedPool(indexer, { totalShares: [0n, seededShares, 0n, 0n, 0n, 0n] })

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair' as const,
              event: 'InterestAccrued' as const,
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 20, timestamp: 200 },
              transaction: { hash: '0xfee', from: ALICE },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 0n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            depositTransfer(ZERO, FEE_TO, 10n, 1, { number: 20, timestamp: 200 }),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[1]).toBe(500n + toAssets(10n, 500n, seededShares))
  })

  it('debt-burn zeroes the borrower and pool totals for the burned tokenType', async () => {
    const indexer = createTestIndexer()
    seedLendingToken(indexer, LEND_BX_ID, POOL_ID, 4)
    seedPool(indexer, {
      totalAssets: [0n, 0n, 0n, 0n, 100n, 0n],
      totalShares: [0n, 0n, 0n, 0n, 100n, 0n],
    })
    indexer.Position.set({
      id: getPositionId(BOB_ID, POOL_ID),
      user_id: BOB_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 0n, 0n, 0n, 100n, 0n],
      shares: [0n, 0n, 0n, 0n, 100n, 0n],
      principal: 0n,
      depositCount: 0,
      withdrawCount: 0,
      borrowCount: 0,
      repayCount: 0,
      transferredCount: 0,
      receivedCount: 0,
    })
    await indexer.process({
      chains: { 11155111: { simulate: [debtTransfer(BOB, ZERO, 100n, 0)] } },
    })
    const bob = await indexer.Position.getOrThrow(getPositionId(BOB_ID, POOL_ID))
    expect(bob.shares[4]).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalShares[4]).toBe(0n)
  })

  it('bad-debt leftover hop nets the pair position and writes no Transfer entity', async () => {
    const indexer = createTestIndexer()
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer, {
      totalAssets: [0n, 300n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 100n, 0n, 0n, 0n, 0n],
    })
    indexer.Position.set({
      id: getPositionId(BOB_ID, POOL_ID),
      user_id: BOB_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 300n, 0n, 0n, 0n, 0n],
      shares: [0n, 100n, 0n, 0n, 0n, 0n],
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
          simulate: [depositTransfer(BOB, POOL, 40n, 0), depositTransfer(POOL, ZERO, 40n, 1)],
        },
      },
    })
    const pair = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(pair.shares[1]).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // totals shrink by the burn leg only (40 shares / toAssets(40,300,100)=120 assets):
    // the pool-bound move leaves totals untouched.
    expect(pool.totalShares[1]).toBe(60n)
    expect(pool.totalAssets[1]).toBe(180n)
    expect(await indexer.Transfer.getAll()).toHaveLength(0)
  })
})
