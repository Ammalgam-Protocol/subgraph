import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const LEND_L = '0x00000000000000000000000000000000000000d0' // DEPOSIT_L lending token
const TO = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_L_ID = scopedId(CHAIN, LEND_L)
const TO_ID = scopedId(CHAIN, TO)
const POSITION_ID = getPositionId(TO_ID, POOL_ID)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: LEND_L_ID,
    symbol: 'aLP',
    name: 'Ammalgam LP',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 0, // DEPOSIT_L
  })
  indexer.Pool.set({ ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n) })
}

describe('depositLiquidity handlers', () => {
  it('Mint bumps counters and writes the entity; totals untouched', async () => {
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
              transaction: { hash: '0xmint', from: TO },
              params: { sender: SENDER, to: TO, assets: 300n, shares: 290n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.depositCount).toBe(1)
    expect(pool.txCount).toBe(1)
    expect(pool.totalAssets[0]).toBe(0n) // semantic events no longer move totals
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.depositCount).toBe(1)
    expect(position.assets[0]).toBe(0n)
    expect(position.principal).toBe(0n)
    const deposit = await indexer.Deposit.getOrThrow(getEventId(CHAIN, '0xmint', 0))
    expect(deposit.amount).toBe(300n)
    expect(deposit.shares).toBe(290n)
  })

  it('Burn attributes to the raw `to` (no rewrite) and bumps counters', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    indexer.Position.set({
      id: POSITION_ID,
      user_id: TO_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [500n, 0n, 0n, 0n, 0n, 0n],
      shares: [500n, 0n, 0n, 0n, 0n, 0n],
      principal: 500n,
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
              contract: 'ERC20DepositLiquidity',
              event: 'Burn',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xburn', from: TO },
              params: { sender: SENDER, to: TO, assets: 200n, shares: 190n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.withdrawCount).toBe(1)
    expect(position.assets[0]).toBe(500n) // untouched from seed
    expect(position.principal).toBe(500n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.withdrawCount).toBe(1)
    const withdraw = await indexer.Withdraw.getOrThrow(getEventId(CHAIN, '0xburn', 0))
    expect(withdraw.amount).toBe(200n)
    expect(withdraw.shares).toBe(190n)
  })

  it('Burn to the pair is a bad debt writeoff and skips the counters', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Burn',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: 13, timestamp: 130 },
              transaction: { hash: '0xbdl', from: SENDER },
              // ERC20LiquidityToken.ownerBurn passes the sender through, so the liquidator
              // stays in `sender` and only `to` identifies the writeoff.
              params: { sender: SENDER, to: POOL, assets: 20n, shares: 18n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.withdrawCount).toBe(0)
    expect(pool.txCount).toBe(0)
    const pairPosition = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(pairPosition.withdrawCount).toBe(0)
    const withdraw = await indexer.Withdraw.getOrThrow(getEventId(CHAIN, '0xbdl', 0))
    expect(withdraw.amount).toBe(20n)
  })
})
