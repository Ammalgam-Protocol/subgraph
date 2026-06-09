import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getPositionId, scopedId } from '../../src/utils/id'
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
  it('Mint sets DEPOSIT_L and principal = direct assets', async () => {
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
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.assets[0]).toBe(300n) // DEPOSIT_L
    expect(position.principal).toBe(300n) // direct assets, no conversion
    expect(position.depositCount).toBe(1)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.depositCount).toBe(1)
    const user = await indexer.User.getOrThrow(TO_ID)
    expect(user.depositCount).toBe(1)
  })

  it('Burn decreases DEPOSIT_L and principal', async () => {
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
    expect(position.assets[0]).toBe(300n)
    expect(position.principal).toBe(300n)
    expect(position.withdrawCount).toBe(1)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.withdrawCount).toBe(1)
    const user = await indexer.User.getOrThrow(TO_ID)
    expect(user.withdrawCount).toBe(1)
  })
})
