import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const LEND_X = '0x00000000000000000000000000000000000000d1'
const LEND_Y = '0x00000000000000000000000000000000000000d2'
const LEND_L = '0x00000000000000000000000000000000000000d0'
const FEE_TO = '0xfee0000000000000000000000000000000000001'
const ALICE = '0xc0de000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const LEND_Y_ID = scopedId(CHAIN, LEND_Y)
const LEND_L_ID = scopedId(CHAIN, LEND_L)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: LEND_X_ID,
    symbol: 'aTKX',
    name: 'Ammalgam TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 1, // DEPOSIT_X
  })
  indexer.LendingToken.set({
    id: LEND_Y_ID,
    symbol: 'aTKY',
    name: 'Ammalgam TKY',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 2, // DEPOSIT_Y
  })
  indexer.LendingToken.set({
    id: LEND_L_ID,
    symbol: 'AMG',
    name: 'Ammalgam Liquidity',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 0, // DEPOSIT_L
  })
  indexer.Pool.set(createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n))
}

describe('protocol fee aggregation', () => {
  it('accumulates pair-sender Deposit mints into protocolFeesTokenX', async () => {
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
              transaction: { hash: '0xpf1', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 1500000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenX.toString()).toBe('1500000000000000000')
    expect(pool.protocolFeesTokenY.toString()).toBe('0')
    expect(pool.protocolFeesTokenL.toString()).toBe('0')
  })

  it('routes DEPOSIT_Y fee mints into protocolFeesTokenY', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_Y,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xpf4', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 2500000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenY.toString()).toBe('2500000000000000000')
    expect(pool.protocolFeesTokenX.toString()).toBe('0')
    expect(pool.protocolFeesTokenL.toString()).toBe('0')
  })

  it('routes Mint (liquidity) fee mints into protocolFeesTokenL', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xpf2', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 3000000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenL.toString()).toBe('3000000000000000000')
    expect(pool.protocolFeesTokenX.toString()).toBe('0')
  })

  it('keeps a Position for feeTo without counting the fee mint as a deposit', async () => {
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
              transaction: { hash: '0xpf4', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 2000000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.depositCount).toBe(0)
    expect(pool.txCount).toBe(0)
    expect(pool.positionCount).toBe(1) // sanity: the Position is still written
    expect(pool.protocolFeesTokenX.toString()).toBe('2000000000000000000') // sanity: not vacuous

    const feeToId = scopedId(CHAIN, FEE_TO)
    const position = await indexer.Position.getOrThrow(getPositionId(feeToId, POOL_ID))
    expect(position.depositCount).toBe(0)
    const user = await indexer.User.getOrThrow(feeToId)
    expect(user.depositCount).toBe(0)
    expect(user.positionCount).toBe(1)
  })

  it('leaves cumulative fees untouched for user deposits', async () => {
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
              transaction: { hash: '0xpf3', from: ALICE },
              params: { sender: ALICE, owner: ALICE, assets: 1500000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenX.toString()).toBe('0')
    expect(pool.protocolFeesTokenY.toString()).toBe('0')
    expect(pool.protocolFeesTokenL.toString()).toBe('0')
  })
})
