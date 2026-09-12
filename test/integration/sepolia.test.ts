import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { scopedId } from '../../src/utils/id'
import { PAIR_GENESIS, REAL_PAIR, SWAP_SYNC } from './fixtures'

const HAS_TOKEN = !!process.env.ENVIO_API_TOKEN
const REAL_PAIR_ID = scopedId(11155111, REAL_PAIR)

describe.skipIf(!HAS_TOKEN)('Sepolia replay', () => {
  it('pair genesis registers a Pool with 6 LendingTokens and real token metadata', async () => {
    const indexer = createTestIndexer()
    const result = await indexer.process({
      chains: { 11155111: { startBlock: PAIR_GENESIS.from, endBlock: PAIR_GENESIS.to } },
    })

    const pool = await indexer.Pool.getOrThrow(REAL_PAIR_ID)
    const lendingTokens = (await indexer.LendingToken.getAll()).filter(
      (t) => t.pool_id === REAL_PAIR_ID,
    )
    expect(lendingTokens).toHaveLength(6)
    expect(pool.tokenX_id).not.toBe('')
    expect(pool.tokenY_id).not.toBe('')
    expect(pool.name).toContain('-')
    expect(result.changes.length).toBeGreaterThan(0)
  }, 120_000)

  it('dynamically registered pair indexes Sync/Swap activity end to end', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: { 11155111: { startBlock: SWAP_SYNC.from, endBlock: SWAP_SYNC.to } },
    })

    const pool = await indexer.Pool.getOrThrow(REAL_PAIR_ID)
    const syncs = await indexer.Sync.getAll()
    // The pair contract is registered dynamically; indexing its events proves the
    // contractRegister -> chain.AmmalgamPair.add wiring works against real chain data.
    expect(pool.syncCount).toBeGreaterThan(0)
    expect(syncs.length).toBeGreaterThan(0)
  }, 120_000)
})
