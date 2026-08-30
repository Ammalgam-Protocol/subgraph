import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const LEND_X = '0x00000000000000000000000000000000000000d1' // DEPOSIT_X lending token
const OWNER = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'
const FEE_TO = '0xfee0000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const OWNER_ID = scopedId(CHAIN, OWNER)
const POSITION_ID = getPositionId(OWNER_ID, POOL_ID)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: LEND_X_ID,
    symbol: 'aTKX',
    name: 'Ammalgam TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 1, // DEPOSIT_X
  })
  const pool = createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, reserveX: 1000n, totalAssets: [1000n, 0n, 0n, 0n, 0n, 0n] })
}

describe('deposit handlers', () => {
  it('Deposit bumps counters and writes the entity; totals untouched', async () => {
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
              transaction: { hash: '0xdep', from: OWNER },
              params: { sender: SENDER, owner: OWNER, assets: 100n, shares: 90n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.depositCount).toBe(1)
    expect(pool.txCount).toBe(1)
    expect(pool.totalAssets[1]).toBe(0n) // semantic events no longer move totals
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.depositCount).toBe(1)
    expect(position.assets[1]).toBe(0n)
    expect(position.principal).toBe(0n)
    const deposit = await indexer.Deposit.getOrThrow(getEventId(CHAIN, '0xdep', 0))
    expect(deposit.amount).toBe(100n)
  })

  it('Withdraw attributes to the raw receiver (no rewrite) and bumps counters', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    indexer.Position.set({
      id: POSITION_ID,
      user_id: OWNER_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 150n, 0n, 0n, 0n, 0n],
      shares: [0n, 150n, 0n, 0n, 0n, 0n],
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
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Withdraw',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: 11, timestamp: 110 },
              transaction: { hash: '0xwd', from: OWNER },
              // ERC4626DepositToken.ownerBurn is onlyOwner and emits Withdraw(msg.sender, to,
              // sender, ...), so on chain `sender` is always the pair and `owner` is the pair's
              // caller, never the share owner.
              params: { sender: POOL, receiver: OWNER, owner: SENDER, assets: 50n, shares: 45n },
            },
          ],
        },
      },
    })
    const position = await indexer.Position.getOrThrow(POSITION_ID)
    expect(position.withdrawCount).toBe(1)
    expect(position.assets[1]).toBe(150n) // untouched from seed
    expect(position.principal).toBe(0n)
    const withdraw = await indexer.Withdraw.getOrThrow(getEventId(CHAIN, '0xwd', 0))
    expect(withdraw.amount).toBe(50n)
  })

  it('Withdraw to the pair is a bad debt writeoff and skips the counters', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Withdraw',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: 13, timestamp: 130 },
              transaction: { hash: '0xbd', from: SENDER },
              // Liquidation burns leftover collateral to the pair itself, so receiver is the
              // pair and the liquidator lands in `owner`.
              params: { sender: POOL, receiver: POOL, owner: SENDER, assets: 20n, shares: 18n },
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
    // The event row is still written: the writeoff happened, it just is not user activity.
    const withdraw = await indexer.Withdraw.getOrThrow(getEventId(CHAIN, '0xbd', 0))
    expect(withdraw.amount).toBe(20n)
  })

  it('Transfer skips zero-value transfers (returns early)', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: 12, timestamp: 120 },
              transaction: { hash: '0xtr', from: OWNER },
              params: { from: SENDER, to: OWNER, value: 0n },
            },
          ],
        },
      },
    })
    const transfers = await indexer.Transfer.getAll()
    expect(transfers).toHaveLength(0)
  })

  it('tags isProtocolFee when the sender is the pair, and not for user deposits', async () => {
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
              transaction: { hash: '0xfee1', from: OWNER },
              params: { sender: POOL, owner: FEE_TO, assets: 10n, shares: 10n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 1,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xfee1', from: OWNER },
              params: { sender: SENDER, owner: OWNER, assets: 10n, shares: 10n },
            },
          ],
        },
      },
    })
    const feeMint = await indexer.Deposit.getOrThrow(getEventId(CHAIN, '0xfee1', 0))
    expect(feeMint.isProtocolFee).toBe(true)
    const userDeposit = await indexer.Deposit.getOrThrow(getEventId(CHAIN, '0xfee1', 1))
    expect(userDeposit.isProtocolFee).toBe(false)
  })
})
