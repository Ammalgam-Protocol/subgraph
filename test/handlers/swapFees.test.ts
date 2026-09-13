import { createTestIndexer, type TestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getEventId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa02000000000000000000000000000000000001'
const TX = '0xaaa1000000000000000000000000000000000001'
const TY = '0xbbb1000000000000000000000000000000000002'
const FROM = '0xf00d000000000000000000000000000000000002'
const SENDER = '0x5e4d000000000000000000000000000000000002'
const TO = '0x7000000000000000000000000000000000000002'

const POOL_ID = scopedId(CHAIN, POOL)
const TX_ID = scopedId(CHAIN, TX)
const TY_ID = scopedId(CHAIN, TY)

function seed(
  indexer: TestIndexer,
  overrides: { totalAssets?: bigint[]; reserveX?: bigint; reserveY?: bigint },
) {
  indexer.Token.set({
    id: TX_ID,
    symbol: 'TKX',
    name: 'Token X',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
  indexer.Token.set({
    id: TY_ID,
    symbol: 'TKY',
    name: 'Token Y',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
  indexer.Pool.set({
    ...createDefaultPool(POOL_ID, TX_ID, TY_ID, 'TKX-TKY', 1n, 1n),
    ...overrides,
  })
}

async function simulateSwap(
  indexer: TestIndexer,
  params: { amountXIn: bigint; amountYIn: bigint; amountXOut: bigint; amountYOut: bigint },
) {
  await indexer.process({
    chains: {
      [CHAIN]: {
        simulate: [
          {
            contract: 'AmmalgamPair',
            event: 'Swap',
            srcAddress: POOL,
            logIndex: 0,
            block: { number: 1, timestamp: 10 },
            transaction: { hash: '0xswap', from: FROM },
            params: { sender: SENDER, to: TO, ...params },
          },
        ],
      },
    },
  })
  return indexer.Swap.getOrThrow(getEventId(CHAIN, '0xswap', 0))
}

describe('swap fees as active-liquidity growth', () => {
  it('single-sided X-in swap values feeL and feeAmountX; feeAmountY is 0', async () => {
    const indexer = createTestIndexer()
    seed(indexer, { reserveX: 1000n, reserveY: 1000n })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 6n,
    })
    // pre=(1000,1000) -> isqrt=1000; post=(1010,994) -> isqrt(1003940)=1001 -> feeL=1
    // feeAmountX = 2*1*calculateSwapFeeReserve(1010,0)/1001 = 2020/1001 = 2
    expect(swap.feeL).toBe(1n)
    expect(swap.feeAmountX).toBe(2n)
    expect(swap.feeAmountY).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.swapFeesTokenX).toBe(2n)
    expect(pool.swapFeesTokenL).toBe(1n)
  })

  it('two-sided swap splits growth across both input tokens', async () => {
    const indexer = createTestIndexer()
    seed(indexer, { reserveX: 1000n, reserveY: 1000n })
    const swap = await simulateSwap(indexer, {
      amountXIn: 15n,
      amountYIn: 15n,
      amountXOut: 0n,
      amountYOut: 0n,
    })
    // pre=(1000,1000)->1000; post=(1015,1015) is a perfect square ->1015; feeL=15
    // even price, equal weights: feeLX=7, feeLY=8; feeAmountX=14, feeAmountY=16
    expect(swap.feeL).toBe(15n)
    expect(swap.feeAmountX).toBe(14n)
    expect(swap.feeAmountY).toBe(16n)
  })

  it('past 95% depletion the valued fee comes back to what was paid, not ~20x it', async () => {
    const indexer = createTestIndexer()
    // missingX = totalAssets[BORROW_X] - totalAssets[DEPOSIT_X] = 960 - 0, 96% of the 1000 reserve
    seed(indexer, { reserveX: 1000n, reserveY: 1000n, totalAssets: [0n, 0n, 0n, 0n, 960n, 0n] })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 0n,
    })
    // reserveAdjustment(1000,960)=800 -> activeBefore=894; reserveAdjustment(1010,960)=1000 -> activeAfter=1000 -> feeL=106
    // calculateSwapFeeReserve(1010,960)=1010-960=50 (depleted) -> feeAmountX=2*106*50/1000=10
    expect(swap.feeL).toBe(106n)
    expect(swap.feeAmountX).toBe(10n)
    // the pre-fix bug valued off the raw reserve instead: 2*106*1010/1000=214, ~20x over
    expect(swap.feeAmountX).not.toBe(214n)
  })

  it('fee columns clamp to zero rather than going negative', async () => {
    const indexer = createTestIndexer()
    seed(indexer, { reserveX: 1000n, reserveY: 1000n })
    // pre=(1000,1000)->1000; post=(1001,998)->isqrt(998998)=999 -> raw growth is -1, clamped to 0
    const swap = await simulateSwap(indexer, {
      amountXIn: 1n,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 2n,
    })
    expect(swap.feeL).toBe(0n)
    expect(swap.feeAmountX).toBe(0n)
    expect(swap.feeAmountY).toBe(0n)
  })
})
