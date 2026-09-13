import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL: `0x${string}` = '0xaa01000000000000000000000000000000000001'
const LEND_X: `0x${string}` = '0x00000000000000000000000000000000000000d1'
const LEND_BL: `0x${string}` = '0x00000000000000000000000000000000000000d3'
const LEND_BX: `0x${string}` = '0x00000000000000000000000000000000000000d4'
const LEND_DL: `0x${string}` = '0x00000000000000000000000000000000000000d0'
const ALICE: `0x${string}` = '0xc0de000000000000000000000000000000000001'
const BOB: `0x${string}` = '0xc0de000000000000000000000000000000000002'
const ZERO: `0x${string}` = '0x0000000000000000000000000000000000000000'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const LEND_BL_ID = scopedId(CHAIN, LEND_BL)
const LEND_BX_ID = scopedId(CHAIN, LEND_BX)
const LEND_DL_ID = scopedId(CHAIN, LEND_DL)
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
    pendingAssets: undefined,
    pendingShares: undefined,
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

function depositAction(
  sender: `0x${string}`,
  owner: `0x${string}`,
  assets: bigint,
  shares: bigint,
  logIndex = 0,
) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Deposit' as const,
    srcAddress: LEND_X,
    logIndex,
    block: { number: 10, timestamp: 100 },
    transaction: { hash: '0xdep', from: owner },
    params: { sender, owner, assets, shares },
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

  it('consumes the exact assets a preceding Deposit stashed, not the floor reconstruction', async () => {
    const indexer = createTestIndexer()
    // rate 2 assets/share pre-existing -> floor(2 shares, TA=2, TS=1) = 4, but the Deposit event
    // carried the exact assets=5 (a legitimate deposit at a slightly different effective rate).
    seed(indexer, {
      totalAssets: [0n, 2n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 1n, 0n, 0n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [depositAction(ALICE, ALICE, 5n, 2n, 0), transfer(ZERO, ALICE, 2n, 1)],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[1]).toBe(7n) // 2 + exact 5, not 2 + floor(4) = 6
    const lendingToken = await indexer.LendingToken.getOrThrow(LEND_X_ID)
    expect(lendingToken.pendingAssets).toBeUndefined() // stash cleared after consumption
    expect(lendingToken.pendingShares).toBeUndefined()
  })

  it('a mint Transfer with no matching stash falls back to the floor reconstruction', async () => {
    const indexer = createTestIndexer()
    seed(indexer, {
      totalAssets: [0n, 2n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 1n, 0n, 0n, 0n, 0n],
    })
    // No preceding Deposit action -> LendingToken.pendingAssets/pendingShares stay unset.
    await indexer.process({ chains: { 11155111: { simulate: [transfer(ZERO, ALICE, 2n)] } } })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[1]).toBe(6n) // 2 + floor(2, 2, 1) = 2 + 4
  })

  it('the stash is cleared after one consumption; a later Transfer at the same value cannot reuse it', async () => {
    const indexer = createTestIndexer()
    seed(indexer, {
      totalAssets: [0n, 2n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 1n, 0n, 0n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            depositAction(ALICE, ALICE, 5n, 2n, 0),
            transfer(ZERO, ALICE, 2n, 1), // consumes the stash: totalAssets 2 -> 7
            transfer(ZERO, BOB, 2n, 2), // same value; stash already cleared -> must use the floor
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // Second mint floors at the post-first-mint rate: toAssets(2, 7, 3) = 4, landing at 11.
    // A stash leak would incorrectly reuse assets=5 here and land at 12 instead.
    expect(pool.totalAssets[1]).toBe(11n)
  })

  it('a BORROW_L mint Transfer re-derives DEPOSIT_L, not just BORROW_L (D10)', async () => {
    const indexer = createTestIndexer()
    indexer.LendingToken.set({
      id: LEND_BL_ID,
      symbol: 'dLP',
      name: 'Debt LP',
      decimals: 18,
      pool_id: POOL_ID,
      tokenType: 3, // BORROW_L
      pendingAssets: undefined,
      pendingShares: undefined,
    })
    const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
    indexer.Pool.set({
      ...pool,
      reserveX: 900n,
      reserveY: 900n,
      // stale/inconsistent on purpose: proves the mint overwrites it, not just adds to it
      totalAssets: [500n, 0n, 0n, 100n, 0n, 0n],
      totalShares: [0n, 0n, 0n, 100n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity',
              event: 'Transfer',
              srcAddress: LEND_BL,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { from: ZERO, to: ALICE, value: 50n },
            },
          ],
        },
      },
    })
    const updated = await indexer.Pool.getOrThrow(POOL_ID)
    expect(updated.totalAssets[3]).toBe(150n) // borrowL 100 + 50
    // missingX = missingY = 0 -> isqrt(900*900) = 900; depositL = 900 + 150, not 500 + 50
    expect(updated.totalAssets[0]).toBe(1050n)
  })

  it('a BORROW_X mint Transfer re-derives DEPOSIT_L through the depletion formula (D10)', async () => {
    const indexer = createTestIndexer()
    indexer.LendingToken.set({
      id: LEND_BX_ID,
      symbol: 'dTKX',
      name: 'Debt TKX',
      decimals: 18,
      pool_id: POOL_ID,
      tokenType: 4, // BORROW_X
      pendingAssets: undefined,
      pendingShares: undefined,
    })
    const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
    indexer.Pool.set({
      ...pool,
      reserveX: 100n,
      reserveY: 100n,
      totalAssets: [999n, 0n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 0n, 0n, 0n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Debt',
              event: 'Transfer',
              srcAddress: LEND_BX,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xbx', from: ALICE },
              params: { from: ZERO, to: ALICE, value: 100n },
            },
          ],
        },
      },
    })
    const updated = await indexer.Pool.getOrThrow(POOL_ID)
    expect(updated.totalAssets[4]).toBe(100n)
    // missingX = 100 - depositX(0) = 100 -> depleted (100*20 > 100*19) -> reserveAdjustment(100,100) = 0
    // depositL = isqrt(0 * reserveAdjustment(100,0)) + borrowL(0) = 0, not the stale 999
    expect(updated.totalAssets[0]).toBe(0n)
  })

  it('a DEPOSIT_L mint Transfer lands its own exact assets and does not re-derive (D10 carve-out)', async () => {
    const indexer = createTestIndexer()
    indexer.LendingToken.set({
      id: LEND_DL_ID,
      symbol: 'aLP',
      name: 'Ammalgam LP',
      decimals: 18,
      pool_id: POOL_ID,
      tokenType: 0, // DEPOSIT_L
      pendingAssets: 777n,
      pendingShares: 50n,
    })
    const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
    indexer.Pool.set({
      ...pool,
      // reserves chosen so the formula (isqrt(1*1) = 1) is nowhere near the exact-assets answer:
      // a regression that re-derives here instead of consuming the stash is unmissable.
      reserveX: 1n,
      reserveY: 1n,
      totalAssets: [1000n, 0n, 0n, 0n, 0n, 0n],
      totalShares: [500n, 0n, 0n, 0n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_DL,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xdl', from: ALICE },
              params: { from: ZERO, to: ALICE, value: 50n },
            },
          ],
        },
      },
    })
    const updated = await indexer.Pool.getOrThrow(POOL_ID)
    expect(updated.totalAssets[0]).toBe(1777n) // 1000 + stashed 777, not isqrt(1*1) = 1
  })
})
