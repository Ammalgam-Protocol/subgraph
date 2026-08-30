import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const TX = '0xaaa0000000000000000000000000000000000001'
const TY = '0xbbb0000000000000000000000000000000000002'
const ALICE = '0xc0de000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const TX_ID = scopedId(CHAIN, TX)
const TY_ID = scopedId(CHAIN, TY)

function seedToken(indexer: ReturnType<typeof createTestIndexer>, id: string, symbol: string) {
  indexer.Token.set({
    id,
    symbol,
    name: symbol,
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
}

describe('swap fee accounting', () => {
  // test/setup.ts forces an unreachable RPC, so the fee effect fails deterministically.
  it('indexes the swap with null fee fields when the reference read fails', async () => {
    const indexer = createTestIndexer()
    seedToken(indexer, TX_ID, 'TKX')
    seedToken(indexer, TY_ID, 'TKY')
    const pool = createDefaultPool(POOL_ID, TX_ID, TY_ID, 'X-Y', 1n, 1n)
    indexer.Pool.set({ ...pool, reserveX: 1000n, reserveY: 1000n })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xswp', from: ALICE },
              params: {
                sender: ALICE,
                to: ALICE,
                amountXIn: 100n,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: 90n,
              },
            },
          ],
        },
      },
    })
    const swap = await indexer.Swap.getOrThrow(getEventId(CHAIN, '0xswp', 0))
    expect(swap.referenceReserveX).toBeUndefined()
    expect(swap.referenceReserveY).toBeUndefined()
    expect(swap.feeBipsQ64X).toBeUndefined()
    expect(swap.feeBipsQ64Y).toBeUndefined()
    expect(swap.feeAmountX).toBeUndefined()
    expect(swap.feeAmountY).toBeUndefined()
    // The swap itself still indexes; cumulative fees record no fallback value.
    const updated = await indexer.Pool.getOrThrow(POOL_ID)
    expect(updated.swapCount).toBe(1)
    expect(updated.swapFeesTokenX.toString()).toBe('0')
    expect(updated.swapFeesTokenY.toString()).toBe('0')
  })
})
