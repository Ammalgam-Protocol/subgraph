import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { DEPOSIT_X } from '../../src/utils/constants'
import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import {
  LENDING_ACTIVITY,
  MANUAL_TRANSFER,
  MANUAL_TRANSFER_TX,
  PAIR_GENESIS,
  REAL_PAIR,
} from './fixtures'

const HAS_TOKEN = !!process.env.ENVIO_API_TOKEN
const CHAIN_ID = 11155111
const REAL_PAIR_ID = scopedId(CHAIN_ID, REAL_PAIR)

describe.skipIf(!HAS_TOKEN)('Sepolia transfer-stream reconstruction', () => {
  it('wallet-to-wallet depositX transfer moves shares exactly (the motivating gap)', async () => {
    const senderId = scopedId(CHAIN_ID, MANUAL_TRANSFER_TX.sender)
    const receiverId = scopedId(CHAIN_ID, MANUAL_TRANSFER_TX.receiver)
    const senderPositionId = getPositionId(senderId, REAL_PAIR_ID)
    const receiverPositionId = getPositionId(receiverId, REAL_PAIR_ID)

    const before = createTestIndexer()
    await before.process({
      chains: { 11155111: { startBlock: PAIR_GENESIS.from, endBlock: MANUAL_TRANSFER.to - 1 } },
    })
    const senderBefore = await before.Position.get(senderPositionId)
    const receiverBefore = await before.Position.get(receiverPositionId)

    const after = createTestIndexer()
    await after.process({
      chains: { 11155111: { startBlock: PAIR_GENESIS.from, endBlock: MANUAL_TRANSFER.to } },
    })
    const senderAfter = await after.Position.getOrThrow(senderPositionId)
    const receiverAfter = await after.Position.getOrThrow(receiverPositionId)

    // Delta across the transfer block, not the raw balance: both sides carry real
    // pre-existing history from genesis, so only the move's own effect is asserted.
    expect(senderAfter.shares[DEPOSIT_X] - (senderBefore?.shares[DEPOSIT_X] ?? 0n)).toBe(
      -MANUAL_TRANSFER_TX.shares,
    )
    expect(receiverAfter.shares[DEPOSIT_X] - (receiverBefore?.shares[DEPOSIT_X] ?? 0n)).toBe(
      MANUAL_TRANSFER_TX.shares,
    )

    const entity = await after.Transfer.getOrThrow(
      getEventId(CHAIN_ID, MANUAL_TRANSFER_TX.hash, MANUAL_TRANSFER_TX.logIndex),
    )
    expect(entity.shares).toBe(MANUAL_TRANSFER_TX.shares)
    expect(entity.senderPosition_id).toBe(senderPositionId)
    expect(entity.receiverPosition_id).toBe(receiverPositionId)
  }, 180_000)

  it('reconstruction invariant: sum(position.shares[t]) === pool.totalShares[t] for every tokenType', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: { startBlock: LENDING_ACTIVITY.from, endBlock: LENDING_ACTIVITY.to },
      },
    })

    const pool = await indexer.Pool.getOrThrow(REAL_PAIR_ID)
    const positions = (await indexer.Position.getAll()).filter((p) => p.pool_id === REAL_PAIR_ID)

    for (let tokenType = 0; tokenType < 6; tokenType++) {
      const sum = positions.reduce((acc, p) => acc + (p.shares[tokenType] ?? 0n), 0n)
      expect(sum).toBe(pool.totalShares[tokenType])
      expect(pool.totalShares[tokenType]).toBeGreaterThanOrEqual(0n)
    }
  }, 120_000)
})
