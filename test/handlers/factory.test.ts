import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { scopedId } from '../../src/utils/id'

// Token metadata is fetched through `context.effect` -> tokenEffects, which runs
// inside the Envio worker thread. Main-thread `vi.mock('viem')` cannot reach the
// worker, so effects are not mocked here. test/setup.ts points ENVIO_RPC_URL_* at
// an unreachable host, so the offline run fails fast and resolves every token to
// the deterministic fallback ('unknown'/0) without touching a live endpoint.
const CHAIN = 11155111
const PAIR = '0xaa01000000000000000000000000000000000001'
const TX = '0xaaa0000000000000000000000000000000000001'
const TY = '0xbbb0000000000000000000000000000000000002'
const LEND = {
  depositL: '0x00000000000000000000000000000000000000d0',
  depositX: '0x00000000000000000000000000000000000000d1',
  depositY: '0x00000000000000000000000000000000000000d2',
  borrowL: '0x00000000000000000000000000000000000000b0',
  borrowX: '0x00000000000000000000000000000000000000b1',
  borrowY: '0x00000000000000000000000000000000000000b2',
} as const

describe('factory handlers', () => {
  it('creates 6 LendingTokens + a Pool, then fills tokenX/Y + name on PairCreated', async () => {
    const indexer = createTestIndexer()
    const result = await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamFactory',
              event: 'LendingTokensCreated',
              params: { pair: PAIR, ...LEND },
            },
            {
              contract: 'AmmalgamFactory',
              event: 'PairCreated',
              block: { number: 100, timestamp: 1000 },
              params: { tokenX: TX, tokenY: TY, pair: PAIR, allPairsLength: 1n },
            },
          ],
        },
      },
    })

    expect(result.changes.length).toBeGreaterThan(0)

    const pool = await indexer.Pool.getOrThrow(scopedId(CHAIN, PAIR))
    // Pool.lendingTokens is a @derivedFrom reverse lookup off LendingToken.pool_id,
    // so the 6 lending tokens are linked by their stored pool_id (no materialized array).
    const lendingTokens = (await indexer.LendingToken.getAll()).filter(
      (t) => t.pool_id === scopedId(CHAIN, PAIR),
    )
    expect(lendingTokens).toHaveLength(6)
    expect(pool.tokenX_id).toBe(scopedId(CHAIN, TX))
    expect(pool.tokenY_id).toBe(scopedId(CHAIN, TY))
    // Offline fallback metadata: symbol resolves to 'unknown' for both tokens.
    expect(pool.name).toBe('unknown-unknown')
    expect(pool.createdAtBlockNumber).toBe(100n)
    expect(pool.createdAtTimestamp).toBe(1000n)

    const depositX = await indexer.LendingToken.getOrThrow(scopedId(CHAIN, LEND.depositX))
    expect(depositX.tokenType).toBe(1) // DEPOSIT_X
    expect(depositX.pool_id).toBe(scopedId(CHAIN, PAIR))
    expect(depositX.symbol).toBe('unknown')
    expect(depositX.decimals).toBe(0)

    const tokenX = await indexer.Token.getOrThrow(scopedId(CHAIN, TX))
    expect(tokenX.symbol).toBe('unknown')
    expect(tokenX.poolCount).toBe(1)
    // TX is not a whitelisted token, so it gains no whitelist pools.
    expect(tokenX.whitelistPoolIds).toEqual([])
    // The effect path resolves token metadata against the unreachable test RPC
    // (test/setup.ts) with retries disabled (ENVIO_RPC_RETRY_COUNT=0), so the 8
    // reads fail instantly and deterministically. Modest timeout covers worker spawn.
  }, 15_000)
})
