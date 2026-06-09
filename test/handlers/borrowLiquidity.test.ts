import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getPositionId, scopedId } from '../../src/utils/id'
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
  })
  indexer.Pool.set({ ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n) })
}

describe('borrowLiquidity handlers', () => {
  it('BorrowLiquidity sets BORROW_L and principal = -assets', async () => {
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
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.assets[3]).toBe(400n) // BORROW_L
    expect(position.principal).toBe(-400n)
    expect(position.borrowCount).toBe(1)
  })

  it('RepayLiquidity decreases BORROW_L and adds principal', async () => {
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
    expect(position.assets[3]).toBe(400n)
    expect(position.principal).toBe(-400n) // -600 + 200
    expect(position.repayCount).toBe(1)
  })
})
