import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { getPositionId, scopedId } from '../../src/utils/id'
import { createDefaultPool } from '../../src/utils/pool'
import {
  lendingTokensCreatedRegistration,
  pairCreatedRegistration,
  testBlockNumber,
} from './testBlock'

const CHAIN = 11155111
const POOL = '0xaa01000000000000000000000000000000000001'
const LEND_X = '0x00000000000000000000000000000000000000d1'
const LEND_Y = '0x00000000000000000000000000000000000000d2'
const LEND_L = '0x00000000000000000000000000000000000000d0'
const LEND_BL = '0x00000000000000000000000000000000000000d3'
const FEE_TO = '0xfee0000000000000000000000000000000000001'
const ALICE = '0xc0de000000000000000000000000000000000001'
const UNUSED_LEND_1 = '0x00000000000000000000000000000000000000e1'
const UNUSED_TX = '0x00000000000000000000000000000000000000e2'
const UNUSED_TY = '0x00000000000000000000000000000000000000e3'

const POOL_ID = scopedId(CHAIN, POOL)

async function seed(indexer: ReturnType<typeof createTestIndexer>) {
  await indexer.process({
    chains: {
      11155111: {
        simulate: [
          lendingTokensCreatedRegistration({
            pair: POOL,
            depositL: LEND_L,
            depositX: LEND_X,
            depositY: LEND_Y,
            borrowL: UNUSED_LEND_1,
            borrowX: UNUSED_LEND_1,
            borrowY: UNUSED_LEND_1,
          }),
          pairCreatedRegistration({ pair: POOL, tokenX: UNUSED_TX, tokenY: UNUSED_TY }),
        ],
      },
    },
  })
  indexer.Pool.set(createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n))
}

// blockOffset 1: seed()/seedAccrualPool() already used offset 0 on this indexer.
async function seedBorrowLiquidityToken(indexer: ReturnType<typeof createTestIndexer>) {
  await indexer.process({
    chains: {
      11155111: {
        simulate: [
          lendingTokensCreatedRegistration({
            pair: POOL,
            depositL: UNUSED_LEND_1,
            depositX: UNUSED_LEND_1,
            depositY: UNUSED_LEND_1,
            borrowL: LEND_BL,
            borrowX: UNUSED_LEND_1,
            borrowY: UNUSED_LEND_1,
            blockOffset: 1,
          }),
        ],
      },
    },
  })
}

describe('protocol fee aggregation', () => {
  it('accumulates pair-sender Deposit mints into protocolFeesTokenX', async () => {
    const indexer = createTestIndexer()
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_Y,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    await seed(indexer)
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
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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
    await seed(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
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

async function seedAccrualPool(indexer: ReturnType<typeof createTestIndexer>) {
  await seed(indexer)
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
    await seedAccrualPool(indexer)
    const block = { number: testBlockNumber(20), timestamp: 200 }

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
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 30n },
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
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 20n },
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
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 5n },
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
    expect(pool.pendingProtocolInterestTxHash).toBeUndefined()

    const feeToId = scopedId(CHAIN, FEE_TO)
    const position = await indexer.Position.getOrThrow(getPositionId(feeToId, POOL_ID))
    expect(position.shares[0]).toBe(5n)
    expect(position.assets[0]).toBe(5n)
    expect(position.principal).toBe(55n)
  })

  it('keeps an initial lending fee on borrow L in the recipient position through the closing Sync', async () => {
    const indexer = createTestIndexer()
    await seedAccrualPool(indexer)
    await seedBorrowLiquidityToken(indexer)
    const block = { number: testBlockNumber(30), timestamp: 300 }
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 1000000n,
      reserveY: 1000000n,
      totalAssets: [1000000n, 0n, 0n, 0n, 0n, 0n],
      totalShares: [1000000n, 0n, 0n, 0n, 0n, 0n],
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
              block,
              transaction: { hash: '0xinitial-l', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 1n, shares: 1n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 1,
              block,
              transaction: { hash: '0xinitial-l', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 1n },
            },
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: LEND_BL,
              logIndex: 2,
              block,
              transaction: { hash: '0xinitial-l', from: ALICE },
              params: { sender: ALICE, to: ALICE, assets: 2001n, shares: 2001n },
            },
            {
              contract: 'ERC20DebtLiquidity',
              event: 'Transfer',
              srcAddress: LEND_BL,
              logIndex: 3,
              block,
              transaction: { hash: '0xinitial-l', from: ALICE },
              params: { from: ADDRESS_ZERO, to: ALICE, value: 2001n },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 4,
              block,
              transaction: { hash: '0xinitial-l', from: ALICE },
              params: { reserveXAssets: 998000n, reserveYAssets: 998000n },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets).toEqual([1000001n, 0n, 0n, 2001n, 0n, 0n])
    expect(pool.totalShares).toEqual([1000001n, 0n, 0n, 2001n, 0n, 0n])
    expect(pool.protocolFeesTokenL).toBe(1n)

    const feeToId = scopedId(CHAIN, FEE_TO)
    const position = await indexer.Position.getOrThrow(getPositionId(feeToId, POOL_ID))
    expect(position.shares[0]).toBe(1n)
    expect(position.assets[0]).toBe(1n)
    expect(position.principal).toBe(1n)
    expect(pool.initialLendingFeesTokenL).toBe(1n)
    expect(pool.initialLendingFeesTokenLAsX).toBe(1n)
    expect(pool.initialLendingFeesTokenLAsY).toBe(1n)
  })

  it('backs out only protocol interest when it shares a transaction with an initial lending fee', async () => {
    const indexer = createTestIndexer()
    await seedAccrualPool(indexer)
    await seedBorrowLiquidityToken(indexer)
    const block = { number: testBlockNumber(31), timestamp: 301 }
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 1000000n,
      reserveY: 1000000n,
      totalAssets: [1000100n, 0n, 0n, 100n, 0n, 0n],
      totalShares: [1000100n, 0n, 0n, 100n, 0n, 0n],
    })

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
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: {
                reserveXAssets: 1000000n,
                reserveYAssets: 1000000n,
                depositXAssets: 0n,
                depositYAssets: 0n,
                borrowLAssets: 110n,
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
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { reserveXAssets: 1000000n, reserveYAssets: 1000000n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 2,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 1n, shares: 1n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 3,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 1n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 4,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 10n, shares: 10n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 5,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 10n },
            },
            {
              contract: 'ERC20DebtLiquidity',
              event: 'BorrowLiquidity',
              srcAddress: LEND_BL,
              logIndex: 6,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { sender: ALICE, to: ALICE, assets: 20010n, shares: 18191n },
            },
            {
              contract: 'ERC20DebtLiquidity',
              event: 'Transfer',
              srcAddress: LEND_BL,
              logIndex: 7,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { from: ADDRESS_ZERO, to: ALICE, value: 18191n },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 8,
              block,
              transaction: { hash: '0xmixed-l', from: ALICE },
              params: { reserveXAssets: 980000n, reserveYAssets: 980000n },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0]).toBe(1000120n)
    expect(pool.totalShares[0]).toBe(1000111n)
    expect(pool.protocolInterestTokenL).toBe(1n)
    expect(pool.protocolFeesTokenL).toBe(11n)
    expect(pool.pendingProtocolInterestTxHash).toBeUndefined()

    const feeToId = scopedId(CHAIN, FEE_TO)
    const position = await indexer.Position.getOrThrow(getPositionId(feeToId, POOL_ID))
    expect(position.shares[0]).toBe(11n)
    expect(position.assets[0]).toBe(11n)
    expect(position.principal).toBe(11n)
    expect(pool.initialLendingFeesTokenL).toBe(10n)
    expect(pool.initialLendingFeesTokenLAsX).toBe(10n)
    expect(pool.initialLendingFeesTokenLAsY).toBe(10n)
  })

  it('does not treat a next-transaction initial lending fee as pending protocol interest', async () => {
    const indexer = createTestIndexer()
    await seedAccrualPool(indexer)
    await seedBorrowLiquidityToken(indexer)
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 1000000n,
      reserveY: 1000000n,
      totalAssets: [1000100n, 0n, 0n, 100n, 0n, 0n],
      totalShares: [1000100n, 0n, 0n, 100n, 0n, 0n],
    })

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair',
              event: 'InterestAccrued',
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(32), timestamp: 302 },
              transaction: { hash: '0xstaged-interest', from: ALICE },
              params: {
                reserveXAssets: 1000000n,
                reserveYAssets: 1000000n,
                depositXAssets: 0n,
                depositYAssets: 0n,
                borrowLAssets: 110n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 0,
              block: { number: testBlockNumber(33), timestamp: 303 },
              transaction: { hash: '0xlater-initial', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 1n, shares: 1n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 1,
              block: { number: testBlockNumber(33), timestamp: 303 },
              transaction: { hash: '0xlater-initial', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 1n },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0]).toBe(1000111n)
    expect(pool.pendingProtocolInterestTxHash).toBeUndefined()
  })
})

describe('D2: protocol fee mint twins pair with InterestAccrued protocol interest', () => {
  it('protocolInterestToken* stays <= protocolFeesToken* once the accrued L fee is minted to the pair', async () => {
    const indexer = createTestIndexer()
    await seedAccrualPool(indexer)
    const block = { number: testBlockNumber(20), timestamp: 200 }

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
              params: { sender: POOL, to: FEE_TO, assets: 1n, shares: 1n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 3,
              block,
              transaction: { hash: '0xti9', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 1n },
            },
          ],
        },
      },
    })

    // gross L 5 -> protocolInterestL = ceil(5 * 10%) = 1, matching the fee mint below.
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.protocolInterestTokenL.toString()).toBe('1')
    expect(pool.protocolInterestTokenLAsX.toString()).toBe('1')
    expect(pool.protocolInterestTokenLAsY.toString()).toBe('1')
    expect(pool.protocolFeesTokenL.toString()).toBe('1')
    expect(pool.protocolFeesTokenLAsX.toString()).toBe('1')
    expect(pool.protocolFeesTokenLAsY.toString()).toBe('1')

    expect(pool.protocolInterestTokenL <= pool.protocolFeesTokenL).toBe(true)
    expect(pool.protocolInterestTokenLAsX <= pool.protocolFeesTokenLAsX).toBe(true)
    expect(pool.protocolInterestTokenLAsY <= pool.protocolFeesTokenLAsY).toBe(true)
  })

  it('reconciles X, Y, and L protocol mints in contract order', async () => {
    const indexer = createTestIndexer()
    await seedAccrualPool(indexer)
    indexer.Pool.set({
      ...createDefaultPool(POOL_ID, 'tx', 'ty', 'X-Y', 1n, 1n),
      reserveX: 50n,
      reserveY: 200n,
      totalAssets: [100n, 100n, 1000n, 0n, 100n, 200n],
      totalShares: [100n, 100n, 1000n, 0n, 100n, 200n],
    })
    const block = { number: testBlockNumber(21), timestamp: 201 }

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
              transaction: { hash: '0xordered', from: ALICE },
              params: {
                reserveXAssets: 50n,
                reserveYAssets: 200n,
                depositXAssets: 100n,
                depositYAssets: 1000n,
                borrowLAssets: 50n,
                borrowXAssets: 150n,
                borrowYAssets: 220n,
              },
            },
            {
              contract: 'AmmalgamPair',
              event: 'Sync',
              srcAddress: POOL,
              logIndex: 1,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { reserveXAssets: 50n, reserveYAssets: 200n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_X,
              logIndex: 2,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 5n, shares: 5n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_X,
              logIndex: 3,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 5n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Deposit',
              srcAddress: LEND_Y,
              logIndex: 4,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { sender: POOL, owner: FEE_TO, assets: 2n, shares: 2n },
            },
            {
              contract: 'ERC4626Deposit',
              event: 'Transfer',
              srcAddress: LEND_Y,
              logIndex: 5,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 2n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Mint',
              srcAddress: LEND_L,
              logIndex: 6,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { sender: POOL, to: FEE_TO, assets: 5n, shares: 5n },
            },
            {
              contract: 'ERC20DepositLiquidity',
              event: 'Transfer',
              srcAddress: LEND_L,
              logIndex: 7,
              block,
              transaction: { hash: '0xordered', from: ALICE },
              params: { from: ADDRESS_ZERO, to: FEE_TO, value: 5n },
            },
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)

    // Reconciles in contract emission order (X, then Y, then L); each token's protocol interest
    // rounds independently before the L twins convert.
    expect(pool.grossInterestTokenX).toBe(50n)
    expect(pool.grossInterestTokenY).toBe(20n)
    expect(pool.grossInterestTokenL).toBe(50n)
    expect(pool.protocolInterestTokenX).toBe(5n)
    expect(pool.protocolInterestTokenY).toBe(2n)
    expect(pool.protocolInterestTokenL).toBe(5n)
    expect(pool.protocolInterestTokenLAsX).toBe(2n)
    expect(pool.protocolInterestTokenLAsY).toBe(10n)
    expect(pool.lpInterestTokenL).toBe(0n)
    expect(pool.lpInterestTokenLAsX).toBe(0n)
    expect(pool.lpInterestTokenLAsY).toBe(0n)
    expect(pool.protocolFeesTokenX).toBe(5n)
    expect(pool.protocolFeesTokenY).toBe(2n)
    expect(pool.protocolFeesTokenL).toBe(5n)
    expect(pool.protocolFeesTokenLAsX).toBe(2n)
    expect(pool.protocolFeesTokenLAsY).toBe(10n)
    expect(pool.totalAssets).toEqual([150n, 105n, 1002n, 50n, 150n, 220n])
    expect(pool.totalShares).toEqual([105n, 105n, 1002n, 0n, 100n, 200n])
    expect(dayData.protocolInterestTokenL).toBe(5n)
    expect(dayData.protocolInterestTokenLAsX).toBe(2n)
    expect(dayData.protocolInterestTokenLAsY).toBe(10n)
    expect(dayData.protocolFeesTokenL).toBe(5n)
  })
})
