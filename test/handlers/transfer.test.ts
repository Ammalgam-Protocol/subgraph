import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL: `0x${string}` = '0xaa01000000000000000000000000000000000001'
const LEND_X: `0x${string}` = '0x00000000000000000000000000000000000000d1'
const ALICE: `0x${string}` = '0xc0de000000000000000000000000000000000001'
const BOB: `0x${string}` = '0xc0de000000000000000000000000000000000002'
const ZERO: `0x${string}` = '0x0000000000000000000000000000000000000000'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const ALICE_ID = scopedId(CHAIN, ALICE)
const BOB_ID = scopedId(CHAIN, BOB)

function seed(
  indexer: ReturnType<typeof createTestIndexer>,
  totals?: Partial<{ totalAssets: bigint[]; totalShares: bigint[] }>,
) {
  indexer.LendingToken.set({
    id: LEND_X_ID,
    symbol: 'aTKX',
    name: 'Ammalgam TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 1,
  })
  const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
  indexer.Pool.set({
    ...pool,
    reserveX: 1000n,
    totalAssets: totals?.totalAssets ?? [1000n, 0n, 0n, 0n, 0n, 0n],
    totalShares: totals?.totalShares ?? [1000n, 0n, 0n, 0n, 0n, 0n],
  })
}

function transfer(from: `0x${string}`, to: `0x${string}`, value: bigint, logIndex = 0) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_X,
    logIndex,
    block: { number: 10, timestamp: 100 },
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

describe('lending-token Transfer accounting', () => {
  it('mint (0x0 -> user) credits shares/assets/principal and pool totals; no entity', async () => {
    const indexer = createTestIndexer()
    // rate 2:1 -> assetsImplied for 100 shares = 200
    seed(indexer, {
      totalAssets: [0n, 200n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 100n, 0n, 0n, 0n, 0n],
    })
    await indexer.process({ chains: { 11155111: { simulate: [transfer(ZERO, ALICE, 100n)] } } })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalShares[1]).toBe(200n)
    expect(pool.totalAssets[1]).toBe(400n)
    const position = await indexer.Position.getOrThrow(getPositionId(ALICE_ID, POOL_ID))
    expect(position.shares[1]).toBe(100n)
    expect(position.assets[1]).toBe(200n) // toAssets(100, 400, 200) at post-delta rate
    expect(await indexer.Transfer.getAll()).toHaveLength(0)
    expect(pool.transferCount).toBe(0)
  })

  it('burn (user -> 0x0) debits both sides symmetrically', async () => {
    const indexer = createTestIndexer()
    seed(indexer, {
      totalAssets: [0n, 200n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 100n, 0n, 0n, 0n, 0n],
    })
    indexer.Position.set({
      id: getPositionId(ALICE_ID, POOL_ID),
      user_id: ALICE_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 200n, 0n, 0n, 0n, 0n],
      shares: [0n, 100n, 0n, 0n, 0n, 0n],
      principal: 0n,
      depositCount: 0,
      withdrawCount: 0,
      borrowCount: 0,
      repayCount: 0,
      transferredCount: 0,
      receivedCount: 0,
    })
    await indexer.process({ chains: { 11155111: { simulate: [transfer(ALICE, ZERO, 40n)] } } })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalShares[1]).toBe(60n)
    expect(pool.totalAssets[1]).toBe(120n) // 200 - toAssets(40,200,100)=80
    const position = await indexer.Position.getOrThrow(getPositionId(ALICE_ID, POOL_ID))
    expect(position.shares[1]).toBe(60n)
    expect(position.assets[1]).toBe(120n)
  })

  it('wallet-to-wallet move credits receiver even with no prior sender position', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({ chains: { 11155111: { simulate: [transfer(ALICE, BOB, 30n)] } } })
    const sender = await indexer.Position.getOrThrow(getPositionId(ALICE_ID, POOL_ID))
    const receiver = await indexer.Position.getOrThrow(getPositionId(BOB_ID, POOL_ID))
    expect(sender.shares[1]).toBe(-30n) // net-zero row semantics: independent sides
    expect(receiver.shares[1]).toBe(30n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalShares[1]).toBe(0n) // move changes no totals
    expect(pool.transferCount).toBe(1)
    const entity = await indexer.Transfer.getOrThrow(getEventId(CHAIN, '0xt', 0))
    expect(entity.shares).toBe(30n)
    expect(entity.amount).toBe(30n) // toAssets(30, TA=0, TS=0) hits the TS==0 branch -> shares 1:1
  })

  it('pool-side move (owner -> pair) accounts but writes no Transfer entity/counters', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({ chains: { 11155111: { simulate: [transfer(ALICE, POOL, 25n)] } } })
    expect(await indexer.Transfer.getAll()).toHaveLength(0)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.transferCount).toBe(0)
    const pair = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(pair.shares[1]).toBe(25n) // accounting still ran
  })

  it('value == 0 is a no-op', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({ chains: { 11155111: { simulate: [transfer(ALICE, BOB, 0n)] } } })
    expect(await indexer.Transfer.getAll()).toHaveLength(0)
    expect(await indexer.Position.getAll()).toHaveLength(0)
  })

  it('withdraw hop then burn nets the pair to zero at identical rate', async () => {
    const indexer = createTestIndexer()
    seed(indexer, {
      totalAssets: [0n, 300n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 100n, 0n, 0n, 0n, 0n],
    })
    indexer.Position.set({
      id: getPositionId(ALICE_ID, POOL_ID),
      user_id: ALICE_ID,
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
          simulate: [transfer(ALICE, POOL, 100n, 0), transfer(POOL, ZERO, 100n, 1)],
        },
      },
    })
    const pair = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(pair.shares[1]).toBe(0n)
    expect(pair.principal).toBe(0n)
    const alice = await indexer.Position.getOrThrow(getPositionId(ALICE_ID, POOL_ID))
    expect(alice.shares[1]).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalShares[1]).toBe(0n)
    expect(pool.totalAssets[1]).toBe(0n)
  })
})
