import { createTestIndexer, type TestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { getEventId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'
import { pairCreatedRegistration, testBlockNumber } from './testBlock'

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

// The swap-fee math reads Token.decimals, so registration's default is overridden below.
async function seed(
  indexer: TestIndexer,
  overrides: { totalAssets?: bigint[]; reserveX?: bigint; reserveY?: bigint },
  decimals: { x: number; y: number } = { x: 18, y: 18 },
) {
  await indexer.process({
    chains: {
      [CHAIN]: {
        simulate: [pairCreatedRegistration({ pair: POOL, tokenX: TX, tokenY: TY })],
      },
    },
  })
  indexer.Token.set({
    ...(await indexer.Token.getOrThrow(TX_ID)),
    decimals: decimals.x,
  })
  indexer.Token.set({
    ...(await indexer.Token.getOrThrow(TY_ID)),
    decimals: decimals.y,
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
            block: { number: testBlockNumber(1), timestamp: 10 },
            transaction: { hash: '0xswap', from: FROM },
            params: { sender: SENDER, to: TO, ...params },
          },
        ],
      },
    },
  })
  return indexer.Swap.getOrThrow(getEventId(CHAIN, '0xswap', 0))
}

describe('swap fees as active-liquidity growth and native input retained', () => {
  // Native fee literals are the fee-free-minimum boundary for each observed output, verified
  // independently of splitSwapFee's own binary search.
  it('uses the proof-checked ceiling for a non-depleted X-input swap', async () => {
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n, reserveY: 1000n })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 6n,
    })

    expect(swap.feeL).toBe(1n)
    expect(swap.feeAmountX).toBe(3n)
    expect(swap.feeAmountY).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.swapFeesTokenX).toBe(3n)
    expect(pool.swapFeesTokenL).toBe(1n)
  })

  it('bisects the depleted 18-decimal witness and reconciles its following Sync', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, {
      reserveX: 1000n * scale,
      reserveY: 1000n * scale,
      totalAssets: [0n, 0n, 0n, 0n, 960n * scale, 0n],
    })
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'Swap',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(1), timestamp: 10 },
              transaction: { hash: '0xdepleted', from: FROM },
              params: {
                sender: SENDER,
                to: TO,
                amountXIn: 10n * scale,
                amountYIn: 0n,
                amountXOut: 0n,
                amountYOut: scale,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 1,
              block: { number: testBlockNumber(1), timestamp: 10 },
              transaction: { hash: '0xdepleted', from: FROM },
              params: {
                reserveXAssets: 1010n * scale,
                reserveYAssets: 999n * scale,
              },
            },
          ],
        },
      },
    })

    const feeL = 105072683937545031572n
    const feeAmountX = 9959959959959959959n
    const swap = await indexer.Swap.getOrThrow(getEventId(CHAIN, '0xdepleted', 0))
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const day = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)
    expect(swap.feeL).toBe(feeL)
    expect(swap.feeAmountX).toBe(feeAmountX)
    expect(swap.feeAmountY).toBe(0n)
    expect(pool.swapFeesTokenL).toBe(feeL)
    expect(pool.swapFeesTokenX).toBe(feeAmountX)
    expect(day.swapFeesTokenL).toBe(feeL)
    expect(day.swapFeesTokenX).toBe(feeAmountX)
    expect(pool.reserveX).toBe(1010n * scale)
    expect(pool.reserveY).toBe(999n * scale)
  })

  it('mirrors the depleted witness for Y input', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, {
      reserveX: 1000n * scale,
      reserveY: 1000n * scale,
      totalAssets: [0n, 0n, 0n, 0n, 0n, 960n * scale],
    })
    const swap = await simulateSwap(indexer, {
      amountXIn: 0n,
      amountYIn: 10n * scale,
      amountXOut: scale,
      amountYOut: 0n,
    })

    expect(swap.feeL).toBe(105072683937545031572n)
    expect(swap.feeAmountX).toBe(0n)
    expect(swap.feeAmountY).toBe(9959959959959959959n)
  })

  it('records the small fee of a contract-reachable near-exact depleted output', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, {
      reserveX: 1000n * scale,
      reserveY: 1000n * scale,
      totalAssets: [0n, 0n, 0n, 0n, 960n * scale, 0n],
    })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n * scale,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 199679871948779511804n,
    })

    expect(swap.feeL).toBe(178939121726250236n)
    expect(swap.feeAmountX).toBe(20000000000000000n)
    expect(swap.feeAmountY).toBe(0n)
  })

  it('records input minus output for a same-token swap', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n * scale, reserveY: 1000n * scale })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n * scale,
      amountYIn: 0n,
      amountXOut: 4n * scale,
      amountYOut: 0n,
    })

    expect(swap.feeL).toBe(2995513449586672676n)
    expect(swap.feeAmountX).toBe(6n * scale)
    expect(swap.feeAmountY).toBe(0n)
  })

  it('records a 1-wei native fee even when feeL rounds to zero', async () => {
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n, reserveY: 1000n })
    const swap = await simulateSwap(indexer, {
      amountXIn: 3n,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 1n,
    })

    expect(swap.feeL).toBe(0n)
    expect(swap.feeAmountX).toBe(1n)
    expect(swap.feeAmountY).toBe(0n)
  })

  it('handles reserves immediately above the depletion boundary', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, {
      reserveX: 1000n * scale + 1n,
      reserveY: 1000n * scale,
      totalAssets: [0n, 0n, 0n, 0n, 950n * scale, 0n],
    })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n * scale,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 5n * scale,
    })

    expect(swap.feeL).toBe(2471944744589847317n)
    expect(swap.feeAmountX).toBe(4974874371859296482n)
  })

  it('bisects a reachable swap crossing out of depletion from one wei below the boundary', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, {
      reserveX: 1000n * scale - 1n,
      reserveY: 1000n * scale,
      totalAssets: [0n, 0n, 0n, 0n, 950n * scale, 0n],
    })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n * scale,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 5n * scale,
    })

    expect(swap.feeL).toBe(2471944744589847327n)
    expect(swap.feeAmountX).toBe(4974874371859296501n)
  })

  it('uses native units for a 6-decimal X and 18-decimal Y pair', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n * 10n ** 6n, reserveY: 1000n * scale }, { x: 6, y: 18 })
    const swap = await simulateSwap(indexer, {
      amountXIn: 10n * 10n ** 6n,
      amountYIn: 0n,
      amountXOut: 0n,
      amountYOut: 5n * scale,
    })

    expect(swap.feeL).toBe(2471944744589n)
    expect(swap.feeAmountX).toBe(4974874n)
    expect(swap.feeAmountY).toBe(0n)
  })

  it('allocates native fees to both inputs along the fee-free ray', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n * scale, reserveY: 1000n * scale })
    const amountXIn = 15n * scale
    const amountYIn = 15n * scale
    const swap = await simulateSwap(indexer, {
      amountXIn,
      amountYIn,
      amountXOut: 0n,
      amountYOut: 20n * scale,
    })

    const feeAmountX = 4950001249937503905n
    const feeAmountY = 4950001249937503905n
    expect(swap.feeL).toBe(4950247524721991896n)
    expect(swap.feeAmountX).toBe(feeAmountX)
    expect(swap.feeAmountY).toBe(feeAmountY)
    expect(swap.feeAmountX).toBeLessThanOrEqual(amountXIn)
    expect(swap.feeAmountY).toBeLessThanOrEqual(amountYIn)

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.swapFeesTokenX).toBe(feeAmountX)
    expect(pool.swapFeesTokenY).toBe(feeAmountY)
  })

  it('uses the larger raw input and is symmetric under token relabelling', async () => {
    const scale = 10n ** 18n
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n * 10n ** 6n, reserveY: 1000n * scale }, { x: 6, y: 18 })
    const swap = await simulateSwap(indexer, {
      amountXIn: 1n,
      amountYIn: scale,
      amountXOut: 0n,
      amountYOut: scale / 2n,
    })

    const mirroredIndexer = createTestIndexer()
    await seed(
      mirroredIndexer,
      { reserveX: 1000n * scale, reserveY: 1000n * 10n ** 6n },
      { x: 18, y: 6 },
    )
    const mirroredSwap = await simulateSwap(mirroredIndexer, {
      amountXIn: scale,
      amountYIn: 1n,
      amountXOut: scale / 2n,
      amountYOut: 0n,
    })

    expect(swap.feeL).toBe(249969257935n)
    expect(swap.feeAmountX).toBe(0n)
    expect(swap.feeAmountY).toBe(500000999999999000n)
    expect(mirroredSwap.feeL).toBe(swap.feeL)
    expect(mirroredSwap.feeAmountX).toBe(swap.feeAmountY)
    expect(mirroredSwap.feeAmountY).toBe(swap.feeAmountX)
  })

  it('records zero native fees for an invalid-state fallback', async () => {
    const indexer = createTestIndexer()
    await seed(indexer, { reserveX: 1000n, reserveY: 1000n })
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
