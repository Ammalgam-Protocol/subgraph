import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const LEND_X = '0x00000000000000000000000000000000000000d1'
const LEND_Y = '0x00000000000000000000000000000000000000d2'
const LEND_L = '0x00000000000000000000000000000000000000d0'
const LEND_BL = '0x00000000000000000000000000000000000000d3'
const FEE_TO = '0xfee0000000000000000000000000000000000001'
const ALICE = '0xc0de000000000000000000000000000000000001'

const POOL_ID = scopedId(CHAIN, POOL)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const LEND_Y_ID = scopedId(CHAIN, LEND_Y)
const LEND_L_ID = scopedId(CHAIN, LEND_L)
const LEND_BL_ID = scopedId(CHAIN, LEND_BL)

function seed(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.LendingToken.set({
    id: LEND_X_ID,
    symbol: 'aTKX',
    name: 'Ammalgam TKX',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 1, // DEPOSIT_X
    pendingAssets: undefined,
    pendingShares: undefined,
  })
  indexer.LendingToken.set({
    id: LEND_Y_ID,
    symbol: 'aTKY',
    name: 'Ammalgam TKY',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 2, // DEPOSIT_Y
    pendingAssets: undefined,
    pendingShares: undefined,
  })
  indexer.LendingToken.set({
    id: LEND_L_ID,
    symbol: 'AMG',
    name: 'Ammalgam Liquidity',
    decimals: 18,
    pool_id: POOL_ID,
    tokenType: 0, // DEPOSIT_L
    pendingAssets: undefined,
    pendingShares: undefined,
  })
  indexer.Pool.set(createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n))
}

describe('protocol fee aggregation', () => {
  it('accumulates pair-sender Deposit mints into protocolFeesTokenX', async () => {
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
              transaction: { hash: '0xpf1', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 1500000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenX.toString()).toBe('1500000000000000000')
    expect(pool.protocolFeesTokenY.toString()).toBe('0')
    expect(pool.protocolFeesTokenL.toString()).toBe('0')
    // X is not L-native (D2): the deposit-side fee mint never touches the L twins.
    expect(pool.protocolFeesTokenLAsX.toString()).toBe('0')
    expect(pool.protocolFeesTokenLAsY.toString()).toBe('0')
  })

  it('routes DEPOSIT_Y fee mints into protocolFeesTokenY', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_Y,
              logIndex: 0,
              block: { number: 10, timestamp: 100 },
              transaction: { hash: '0xpf4', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 2500000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenY.toString()).toBe('2500000000000000000')
    expect(pool.protocolFeesTokenX.toString()).toBe('0')
    expect(pool.protocolFeesTokenL.toString()).toBe('0')
    expect(pool.protocolFeesTokenLAsX.toString()).toBe('0')
    expect(pool.protocolFeesTokenLAsY.toString()).toBe('0')
  })

  it('routes Mint (liquidity) fee mints into protocolFeesTokenL', async () => {
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
              transaction: { hash: '0xpf2', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 3000000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenL.toString()).toBe('3000000000000000000')
    expect(pool.protocolFeesTokenX.toString()).toBe('0')
  })

  it('twins the DEPOSIT_L fee mint into protocolFeesTokenLAsX/LAsY at the re-derived active liquidity', async () => {
    const indexer = createTestIndexer()
    seed(indexer)
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 1000n,
      reserveY: 4000n,
      totalAssets: [0n, 500n, 500n, 0n, 0n, 0n],
      totalShares: [0n, 500n, 500n, 0n, 0n, 0n],
    })
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
              transaction: { hash: '0xpf5', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 10n, shares: 10n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // activeLiquidity = isqrt(reserveX*reserveY) = isqrt(1000*4000) = isqrt(4,000,000) = 2000 exactly
    // (missingX/Y are 0: no borrows). fee 10 L -> x = 10*1000/2000 = 5, y = 10*4000/2000 = 20.
    expect(pool.protocolFeesTokenL.toString()).toBe('10')
    expect(pool.protocolFeesTokenLAsX.toString()).toBe('5')
    expect(pool.protocolFeesTokenLAsY.toString()).toBe('20')
  })

  it('keeps a Position for feeTo without counting the fee mint as a deposit', async () => {
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
              transaction: { hash: '0xpf4', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 2000000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.depositCount).toBe(0)
    expect(pool.txCount).toBe(0)
    expect(pool.positionCount).toBe(1) // sanity: the Position is still written
    expect(pool.protocolFeesTokenX.toString()).toBe('2000000000000000000') // sanity: not vacuous

    const feeToId = scopedId(CHAIN, FEE_TO)
    const position = await indexer.Position.getOrThrow(getPositionId(feeToId, POOL_ID))
    expect(position.depositCount).toBe(0)
    const user = await indexer.User.getOrThrow(feeToId)
    expect(user.depositCount).toBe(0)
    expect(user.positionCount).toBe(1)
  })

  it('leaves cumulative fees untouched for user deposits', async () => {
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
              transaction: { hash: '0xpf3', from: ALICE },
              params: { sender: ALICE, owner: ALICE, assets: 1500000000000000000n, shares: 1n },
            },
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolFeesTokenX.toString()).toBe('0')
    expect(pool.protocolFeesTokenY.toString()).toBe('0')
    expect(pool.protocolFeesTokenL.toString()).toBe('0')
  })
})

function seedAccrualPool(indexer: ReturnType<typeof createTestIndexer>) {
  seed(indexer)
  indexer.Token.set({
    id: 'tx',
    symbol: 'TKX',
    name: 'Token X',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
  indexer.Token.set({
    id: 'ty',
    symbol: 'TKY',
    name: 'Token Y',
    decimals: 18,
    poolCount: 1,
    txCount: 0,
    volume: 0n,
    whitelistPoolIds: [],
  })
  indexer.Pool.set({
    ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
    reserveX: 1000n,
    reserveY: 1000n,
    // depositL = isqrt(reserveX*reserveY) + borrowL = 1000 + 0, self-consistent at seed time.
    totalAssets: [1000n, 500n, 500n, 0n, 0n, 0n],
    totalShares: [1000n, 500n, 500n, 0n, 0n, 0n],
  })
}

describe('D11: pair-sender L fee mint backs out of deposit L', () => {
  it('lands deposit L at the pre-mint value once the mint Transfer lands', async () => {
    const indexer = createTestIndexer()
    seedAccrualPool(indexer)
    const block = { number: 20, timestamp: 200 }
    const ZERO = '0x0000000000000000000000000000000000000000'

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 50n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 1,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { reserveXAssets: 1000n, reserveYAssets: 1000n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 2,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 30n, shares: 30n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_X,
              logIndex: 3,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 30n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_Y,
              logIndex: 4,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 20n, shares: 20n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_Y,
              logIndex: 5,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 20n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 6,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 5n, shares: 5n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 7,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 5n },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // Active liquidity 1000 (reserves untouched by the X/Y/L fee mints) plus re-derived borrowL 50,
    // unchanged by the L mint's own 5, which only diluted shares.
    expect(pool.totalAssets[0]).toBe(1050n)
    expect(pool.totalShares[0]).toBe(1005n) // 1000 seeded + 5 minted: dilution, not growth
  })

  it('exposes the re-derived-minus-fee state between the Mint and its Transfer', async () => {
    const indexer = createTestIndexer()
    seedAccrualPool(indexer)
    const block = { number: 20, timestamp: 200 }
    const ZERO = '0x0000000000000000000000000000000000000000'

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 50n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 1,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 30n, shares: 30n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_X,
              logIndex: 2,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 30n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_Y,
              logIndex: 3,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 20n, shares: 20n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_Y,
              logIndex: 4,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 20n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 5,
              block,
              transaction: { hash: '0xacc', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 5n, shares: 5n },
            },
          ],
        },
      },
    })

    // Snapshot right after the Mint event, before its Transfer lands the exact assets back: the
    // mint's own delta briefly nets out, re-derived 1050 minus the fee 5.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0]).toBe(1045n)
  })

  function seedBorrowLiquidityPool(indexer: ReturnType<typeof createTestIndexer>) {
    seed(indexer)
    indexer.LendingToken.set({
      id: LEND_BL_ID,
      symbol: 'dLP',
      name: 'Debt LP',
      decimals: 18,
      pool_id: POOL_ID,
      tokenType: 3, // BORROW_L
      pendingAssets: undefined,
      pendingShares: undefined,
    })
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 1000n,
      reserveY: 1000n,
      totalAssets: [1000n, 500n, 500n, 0n, 0n, 0n],
      totalShares: [1000n, 500n, 500n, 0n, 0n, 0n],
    })
  }

  it("borrowLiquidity's initial-lending L mint leaves deposit L unchanged by the mint itself", async () => {
    const indexer = createTestIndexer()
    seedBorrowLiquidityPool(indexer)
    const ZERO = '0x0000000000000000000000000000000000000000'

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: 30, timestamp: 300 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 5n, shares: 5n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 1,
              block: { number: 30, timestamp: 300 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 5n },
            },
          ],
        },
      },
    })

    // Right after the mint's own Transfer, deposit L is exactly where it started: the mint
    // diluted shares, it did not grow deposit L.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0]).toBe(1000n)
  })

  it("borrowLiquidity's BORROW_L Transfer re-derives the final total after the fee mint", async () => {
    const indexer = createTestIndexer()
    seedBorrowLiquidityPool(indexer)
    const ZERO = '0x0000000000000000000000000000000000000000'

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: 30, timestamp: 300 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 5n, shares: 5n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 1,
              block: { number: 30, timestamp: 300 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 5n },
            },
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: LEND_BL,
              logIndex: 2,
              block: { number: 30, timestamp: 300 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { sender: ALICE, to: ALICE, assets: 50n, shares: 50n },
            },
            {
              contract: 'ERC20DebtLiquidity',
              event: 'Transfer',
              srcAddress: LEND_BL,
              logIndex: 3,
              block: { number: 30, timestamp: 300 },
              transaction: { hash: '0xbl', from: ALICE },
              params: { from: ZERO, to: ALICE, value: 50n },
            },
          ],
        },
      },
    })

    // The borrow's own BORROW_L Transfer re-derives and lands the correct final total regardless
    // of the L mint's intermediate value: the same re-derivation path handles both events.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0]).toBe(1050n)
  })
})

describe('D2: protocol fee mint twins pair with InterestAccrued protocol interest', () => {
  it('protocolInterestToken* stays <= protocolFeesToken* once the accrued L fee is minted to the pair', async () => {
    const indexer = createTestIndexer()
    seedAccrualPool(indexer)
    const block = { number: 20, timestamp: 200 }
    const ZERO = '0x0000000000000000000000000000000000000000'

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block,
              transaction: { hash: '0xti9', from: ALICE },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 5n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 1,
              block,
              transaction: { hash: '0xti9', from: ALICE },
              params: { reserveXAssets: 1000n, reserveYAssets: 1000n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 2,
              block,
              transaction: { hash: '0xti9', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 5n, shares: 5n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 3,
              block,
              transaction: { hash: '0xti9', from: ALICE },
              params: { from: ZERO, to: FEE_TO, value: 5n },
            },
          ],
        },
      },
    })

    // borrowL 0 -> 5 leaves active liquidity at 1000 both before and after (L has no reserve
    // share, D3), so the protocol-interest and protocol-fee mints of that same 5 L twin equally.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolInterestTokenL.toString()).toBe('5')
    expect(pool.protocolInterestTokenLAsX.toString()).toBe('5')
    expect(pool.protocolInterestTokenLAsY.toString()).toBe('5')
    expect(pool.protocolFeesTokenL.toString()).toBe('5')
    expect(pool.protocolFeesTokenLAsX.toString()).toBe('5')
    expect(pool.protocolFeesTokenLAsY.toString()).toBe('5')

    expect(pool.protocolInterestTokenL <= pool.protocolFeesTokenL).toBe(true)
    expect(pool.protocolInterestTokenLAsX <= pool.protocolFeesTokenLAsX).toBe(true)
    expect(pool.protocolInterestTokenLAsY <= pool.protocolFeesTokenLAsY).toBe(true)
  })
})
