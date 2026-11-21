import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { toAssets } from '../../src/utils/math'
import { createDefaultPool } from '../../src/utils/pool'
import { createDefaultPosition } from '../../src/utils/position'
import {
  lendingTokensCreatedRegistration,
  pairCreatedRegistration,
  testBlockNumber,
} from './testBlock'

type Address = `0x${string}`
type Indexer = ReturnType<typeof createTestIndexer>

const CHAIN = 11155111
const POOL: Address = '0x1df5595c634167120d027cd68b847057b97f0f53'
const TOKEN_X: Address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const TOKEN_Y: Address = '0xb753428af26e81097e7fd17f40c88aaa3e04902c'
const BORROWER: Address = '0x114d306b7c2e5b132efa56f13b3781beefef690d'
const EOA: Address = '0xc0ffeebabe5d496b2dde509f9fa189c25cf29671'
const BOT: Address = '0xe08d97e151473a848c3d9ca3f323cb720472d015'
const BORROWER2: Address = '0xb0b2000000000000000000000000000000000002'
const ALICE: Address = '0xc0de000000000000000000000000000000000001'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const LEND_L: Address = '0x00000000000000000000000000000000000000d0'
const LEND_X: Address = '0x00000000000000000000000000000000000000d1'
const LEND_Y: Address = '0x00000000000000000000000000000000000000d2'
const DEBT_L: Address = '0x00000000000000000000000000000000000000d3'
const DEBT_X: Address = '0x00000000000000000000000000000000000000d4'
const DEBT_Y: Address = '0x00000000000000000000000000000000000000d5'

const POOL_ID = scopedId(CHAIN, POOL)
const BORROWER_ID = scopedId(CHAIN, BORROWER)
const EOA_ID = scopedId(CHAIN, EOA)
const ALICE_ID = scopedId(CHAIN, ALICE)
const BORROWER2_ID = scopedId(CHAIN, BORROWER2)
const BORROWER_POSITION_ID = getPositionId(BORROWER_ID, POOL_ID)

const HASH = '0xf1799c4e'
const PRE_RESERVE_X = 32855996813n
const PRE_RESERVE_Y = 520192312132012943779n
const RESERVE_X = 32858182694n
const RESERVE_Y = 520226901381038837560n
const SEIZED_L_SHARES = 558643353284608n
const SEIZED_L_ASSETS = 560955433922138n
const ZEROS = [0n, 0n, 0n]

type Tx = { hash: string; from: string; to?: string }
const MAIN_TX: Tx = { hash: HASH, from: EOA, to: BOT }
const BLOCK = { number: testBlockNumber(10), timestamp: 100 }

function transfer(
  contract: 'ERC20DepositLiquidity' | 'ERC4626Debt' | 'ERC20DebtLiquidity' | 'ERC4626Deposit',
  srcAddress: Address,
  from: Address,
  to: Address,
  value: bigint,
  logIndex: number,
) {
  return {
    contract,
    event: 'Transfer' as const,
    srcAddress,
    logIndex,
    block: BLOCK,
    transaction: MAIN_TX,
    params: { from, to, value },
  }
}

function repayX(
  sender: Address,
  assets: bigint,
  shares: bigint,
  logIndex: number,
  borrower: Address = BORROWER,
) {
  return {
    contract: 'ERC4626Debt' as const,
    event: 'Repay' as const,
    srcAddress: DEBT_X,
    logIndex,
    block: BLOCK,
    transaction: MAIN_TX,
    params: { sender, onBehalfOf: borrower, assets, shares },
  }
}

function repayL(assets: bigint, shares: bigint, logIndex: number) {
  return {
    contract: 'ERC20DebtLiquidity' as const,
    event: 'RepayLiquidity' as const,
    srcAddress: DEBT_L,
    logIndex,
    block: BLOCK,
    transaction: MAIN_TX,
    params: { sender: BOT, onBehalfOf: BORROWER, assets, shares },
  }
}

function penaltyBorrowL(logIndex: number) {
  return {
    contract: 'ERC20DebtLiquidity' as const,
    event: 'BorrowLiquidity' as const,
    srcAddress: DEBT_L,
    logIndex,
    block: BLOCK,
    transaction: MAIN_TX,
    params: { sender: POOL, to: POOL, assets: 3691054n, shares: 3683255n },
  }
}

function burnBadDebt(tokenType: bigint, assets: bigint, shares: bigint, logIndex: number) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'BurnBadDebt' as const,
    srcAddress: POOL,
    logIndex,
    block: BLOCK,
    transaction: MAIN_TX,
    params: { borrower: BORROWER, tokenType, badDebtAssets: assets, badDebtShares: shares },
  }
}

function liquidate(
  to: Address,
  type: bigint,
  logIndex: number,
  repaid: { x: bigint; y: bigint } = { x: 8722020560n, y: 34589249025893781n },
  tx: Tx = MAIN_TX,
  borrower: Address = BORROWER,
) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'Liquidate' as const,
    srcAddress: POOL,
    logIndex,
    block: BLOCK,
    transaction: tx,
    params: {
      borrower,
      to,
      actualRepaidXAssets: repaid.x,
      actualRepaidYAssets: repaid.y,
      liquidationType: type,
    },
  }
}

function seizeDepositL(
  to: Address,
  logIndex: number,
  from: Address = BORROWER,
  shares: bigint = SEIZED_L_SHARES,
) {
  return transfer('ERC20DepositLiquidity', LEND_L, from, to, shares, logIndex)
}

function sync(reserveXAssets: bigint, reserveYAssets: bigint, logIndex: number) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'Sync' as const,
    srcAddress: POOL,
    logIndex,
    block: BLOCK,
    transaction: MAIN_TX,
    params: { reserveXAssets, reserveYAssets },
  }
}

// preReserves seeds the previous block's reserves; the liquidationLogs sequence must Sync to the final ones.
async function setup(preReserves = false): Promise<Indexer> {
  const indexer = createTestIndexer()
  await indexer.process({
    chains: {
      [CHAIN]: {
        simulate: [
          lendingTokensCreatedRegistration({
            pair: POOL,
            depositL: LEND_L,
            depositX: LEND_X,
            depositY: LEND_Y,
            borrowL: DEBT_L,
            borrowX: DEBT_X,
            borrowY: DEBT_Y,
          }),
          pairCreatedRegistration({ pair: POOL, tokenX: TOKEN_X, tokenY: TOKEN_Y }),
        ],
      },
    },
  })
  for (const [address, decimals] of [
    [TOKEN_X, 6],
    [TOKEN_Y, 18],
  ] as const) {
    indexer.Token.set({
      id: scopedId(CHAIN, address),
      symbol: 'TK',
      name: 'Token',
      decimals,
      poolCount: 1,
      txCount: 0,
      volume: 0n,
      whitelistPoolIds: [],
    })
  }
  // The six sequences below use one pool whose deposit-L floor conversion returns exactly
  // SEIZED_L_ASSETS: after the debt burns, totalAssets[L] = isqrt(reserveX * reserveY) + borrowL.
  const pool = createDefaultPool(
    POOL_ID,
    scopedId(CHAIN, TOKEN_X),
    scopedId(CHAIN, TOKEN_Y),
    'X-Y',
    1n,
    1n,
  )
  indexer.Pool.set({
    ...pool,
    reserveX: preReserves ? PRE_RESERVE_X : RESERVE_X,
    reserveY: preReserves ? PRE_RESERVE_Y : RESERVE_Y,
    totalAssets: [4135179192327097n, 0n, 0n, 1_000_000_000_000n, 9_000_000_000n, 0n],
    totalShares: [4118135293355570n, 0n, 0n, 1_000_000_000_000n, 9_000_000_000n, 0n],
  })
  return indexer
}

async function run(indexer: Indexer, events: object[]) {
  await indexer.process({
    chains: { [CHAIN]: { simulate: events as never } },
  })
}

// Penalty mint, debt repays and the deposit-L seizure, in on-chain order.
function liquidationLogs(to: Address) {
  return [
    penaltyBorrowL(7),
    transfer('ERC20DebtLiquidity', DEBT_L, ZERO, POOL, 3683255n, 8),
    transfer('ERC20DebtLiquidity', DEBT_L, POOL, BORROWER, 351803841133n, 9),
    sync(PRE_RESERVE_X, PRE_RESERVE_Y, 13),
    repayX(BOT, 8719835859n, 8678983028n, 16),
    transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 8678983028n, 17),
    repayL(274894784366n, 274313944637n, 18),
    transfer('ERC20DebtLiquidity', DEBT_L, BORROWER, ZERO, 274313944637n, 19),
    sync(RESERVE_X, RESERVE_Y, 20),
    seizeDepositL(to, 21),
  ]
}

describe('Liquidate handler', () => {
  it('keeps the penalty mint out of the stash', async () => {
    const indexer = await setup(true)
    await run(indexer, liquidationLogs(POOL))

    const stash = await indexer.Position.getOrThrow(BORROWER_POSITION_ID)
    expect(stash.pendingTxHash).toBe(HASH)
    expect(stash.pendingSeizedAssets).toEqual([SEIZED_L_ASSETS, 0n, 0n])
    expect(stash.pendingRepaidAssets).toEqual([274894784366n, 8719835859n, 0n])
    expect(stash.pendingBadDebtAssets).toEqual(ZEROS)
    const pairStash = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(pairStash.pendingTxHash).toBeUndefined()
  })

  it('reproduces the mainnet hard liquidation from one block of logs in order', async () => {
    const indexer = await setup(true)
    await run(indexer, [...liquidationLogs(POOL), liquidate(POOL, 0n, 23)])

    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 23))
    expect(liq).toMatchObject({
      pool_id: POOL_ID,
      borrower_id: BORROWER_ID,
      liquidator_id: EOA_ID,
      liquidatorContract: BOT,
      recipient_id: POOL_ID,
      liquidationType: 0n,
      kind: 'HARD',
      actualRepaidXAssets: 8722020560n,
      actualRepaidYAssets: 34589249025893781n,
      repaidDebtLAssets: 274894784366n,
      repaidDebtXAssets: 8719835859n,
      repaidDebtYAssets: 0n,
      seizedLAssets: SEIZED_L_ASSETS,
      seizedXAssets: 0n,
      seizedYAssets: 0n,
      seizedLAsX: 4458140242n,
      seizedLAsY: 70583467929276313196n,
      repaidDebtLAsX: 2184700n,
      repaidDebtLAsY: 34589249025647332n,
      reserveX: RESERVE_X,
      reserveY: RESERVE_Y,
      badDebtLAssets: 0n,
      badDebtXAssets: 0n,
      badDebtYAssets: 0n,
      premiumBips: 10220,
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.liquidateCount).toBe(1)
    expect((await indexer.User.getOrThrow(BORROWER_ID)).liquidationCount).toBe(1)
    const cleared = await indexer.Position.getOrThrow(BORROWER_POSITION_ID)
    expect(cleared.pendingTxHash).toBe(HASH)
    expect(cleared.pendingSeizedAssets).toEqual(ZEROS)
    expect(cleared.pendingRepaidAssets).toEqual(ZEROS)
    expect(cleared.pendingBadDebtAssets).toEqual(ZEROS)
  })

  it('treats SATURATION with nothing repaid as a null premium', async () => {
    const indexer = await setup()
    await run(indexer, [seizeDepositL(POOL, 1), liquidate(POOL, 1n, 2, { x: 0n, y: 0n })])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 2))
    expect(liq).toMatchObject({
      kind: 'SATURATION',
      liquidationType: 1n,
      repaidDebtLAssets: 0n,
      repaidDebtXAssets: 0n,
      repaidDebtYAssets: 0n,
      seizedLAssets: SEIZED_L_ASSETS,
      seizedLAsX: 4458140242n,
      repaidDebtLAsX: 0n,
      repaidDebtLAsY: 0n,
      premiumBips: undefined,
    })
    expect((await indexer.Pool.getOrThrow(POOL_ID)).liquidateCount).toBe(1)
  })

  it('classifies LEVERAGE', async () => {
    const indexer = await setup()
    await run(indexer, [seizeDepositL(POOL, 1), liquidate(POOL, 2n, 2)])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 2))
    expect(liq.kind).toBe('LEVERAGE')
    expect(liq.seizedLAssets).toBe(SEIZED_L_ASSETS)
    expect((await indexer.Pool.getOrThrow(POOL_ID)).liquidateCount).toBe(1)
  })

  it('reads the same seizure when the recipient is an ordinary address', async () => {
    const indexer = await setup(true)
    await run(indexer, [...liquidationLogs(ALICE), liquidate(ALICE, 0n, 23)])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 23))
    expect(liq).toMatchObject({
      recipient_id: ALICE_ID,
      liquidator_id: EOA_ID,
      seizedLAssets: SEIZED_L_ASSETS,
      seizedLAsX: 4458140242n,
      repaidDebtLAsX: 2184700n,
      premiumBips: 10220,
      repaidDebtXAssets: 8719835859n,
      repaidDebtLAssets: 274894784366n,
    })
  })

  it('ignores a stash left by an earlier transaction', async () => {
    const indexer = await setup()
    indexer.Position.set({
      ...createDefaultPosition(BORROWER_ID, POOL_ID, '0xold', 1n, 1n),
      pendingTxHash: '0xold',
      pendingSeizedAssets: [5n, 6n, 7n],
      pendingRepaidAssets: [8n, 9n, 10n],
      pendingBadDebtAssets: [11n, 12n, 13n],
    })
    await run(indexer, [liquidate(POOL, 1n, 2)])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 2))
    expect(liq).toMatchObject({
      seizedLAssets: 0n,
      seizedXAssets: 0n,
      seizedYAssets: 0n,
      repaidDebtLAssets: 0n,
      repaidDebtXAssets: 0n,
      repaidDebtYAssets: 0n,
      badDebtLAssets: 0n,
      badDebtXAssets: 0n,
      badDebtYAssets: 0n,
    })
  })

  it('does not double count when one transaction liquidates the borrower twice', async () => {
    const indexer = await setup(true)
    await run(indexer, [...liquidationLogs(POOL), liquidate(POOL, 0n, 23), liquidate(POOL, 0n, 24)])
    const first = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 23))
    const second = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 24))
    expect(first.seizedLAssets).toBe(SEIZED_L_ASSETS)
    expect(first.repaidDebtXAssets).toBe(8719835859n)
    expect(second.seizedLAssets).toBe(0n)
    expect(second.repaidDebtXAssets).toBe(0n)
    expect(second.repaidDebtLAssets).toBe(0n)
    expect(second.premiumBips).toBeUndefined()
    expect((await indexer.Pool.getOrThrow(POOL_ID)).liquidateCount).toBe(2)
  })

  it('reports bad debt separately and keeps it out of repaid debt', async () => {
    const indexer = await setup()
    await run(indexer, [
      repayX(BOT, 100n, 90n, 1),
      transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 90n, 2),
      repayX(POOL, 700n, 650n, 3),
      transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 650n, 4),
      burnBadDebt(4n, 700n, 650n, 5),
      seizeDepositL(POOL, 6),
      liquidate(POOL, 0n, 7),
    ])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 7))
    expect(liq).toMatchObject({
      badDebtLAssets: 0n,
      badDebtXAssets: 700n,
      badDebtYAssets: 0n,
      repaidDebtLAssets: 0n,
      repaidDebtXAssets: 100n,
      repaidDebtYAssets: 0n,
    })
  })

  it('keeps a lone write-off out of repaid debt', async () => {
    const indexer = await setup()
    await run(indexer, [
      repayX(POOL, 700n, 650n, 1),
      transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 650n, 2),
      burnBadDebt(4n, 700n, 650n, 3),
    ])
    const stash = await indexer.Position.getOrThrow(BORROWER_POSITION_ID)
    expect(stash.pendingRepaidAssets).toEqual(ZEROS)
    expect(stash.pendingBadDebtAssets).toEqual([0n, 700n, 0n])
  })

  it('leaves liquidatorContract null when the target is the pair or missing', async () => {
    const indexer = await setup()
    const toPair: Tx = { hash: '0xa', from: EOA, to: POOL.toUpperCase().replace('0X', '0x') }
    const noTarget: Tx = { hash: '0xb', from: EOA }
    const mixedCase: Tx = {
      hash: '0xc',
      from: EOA,
      to: '0xE08D97e151473A848C3d9CA3f323Cb720472D015',
    }
    await run(indexer, [
      liquidate(POOL, 1n, 1, undefined, toPair),
      liquidate(POOL, 1n, 2, undefined, noTarget),
      liquidate(POOL, 1n, 3, undefined, mixedCase),
    ])
    expect(
      (await indexer.Liquidate.getOrThrow(getEventId(CHAIN, '0xa', 1))).liquidatorContract,
    ).toBeUndefined()
    expect(
      (await indexer.Liquidate.getOrThrow(getEventId(CHAIN, '0xb', 2))).liquidatorContract,
    ).toBeUndefined()
    expect(
      (await indexer.Liquidate.getOrThrow(getEventId(CHAIN, '0xc', 3))).liquidatorContract,
    ).toBe(BOT)
  })

  it('stores liquidator, recipient and contract lowercase whatever case the logs carry', async () => {
    const indexer = await setup()
    const mixedFrom = '0xC0FFEEbabe5D496B2dDe509F9fa189C25cF29671'
    const mixedTo = '0xE08D97e151473A848C3d9CA3f323Cb720472D015'
    const mixedRecipient = '0xC0DE000000000000000000000000000000000001'
    const tx: Tx = { hash: '0xcase', from: mixedFrom, to: mixedTo }
    await run(indexer, [liquidate(mixedRecipient as Address, 1n, 1, undefined, tx)])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, '0xcase', 1))
    expect(liq.liquidator_id).toBe(EOA_ID)
    expect(liq.recipient_id).toBe(ALICE_ID)
    expect(liq.liquidatorContract).toBe(BOT)
    expect(await indexer.User.get(scopedId(CHAIN, mixedFrom))).toBeUndefined()
  })

  it('writes nothing for an unsupported liquidation type', async () => {
    const indexer = await setup()
    await run(indexer, [liquidate(POOL, 9n, 1)])
    expect(await indexer.Liquidate.getAll()).toHaveLength(0)
    expect(await indexer.User.getAll()).toHaveLength(0)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.liquidateCount).toBe(0)
    expect(pool.txCount).toBe(0)
  })

  it('leaves the stash for a real liquidation that follows an unsupported one', async () => {
    const indexer = await setup()
    await run(indexer, [
      repayX(BOT, 100n, 90n, 2),
      transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 90n, 3),
      liquidate(POOL, 9n, 4),
      liquidate(POOL, 0n, 5),
    ])
    expect(await indexer.Liquidate.get(getEventId(CHAIN, HASH, 4))).toBeUndefined()
    const hard = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 5))
    expect(hard.kind).toBe('HARD')
    expect(hard.repaidDebtXAssets).toBe(100n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.liquidateCount).toBe(1)
    expect((await indexer.User.getOrThrow(BORROWER_ID)).liquidationCount).toBe(1)
  })

  it('pins a self-liquidation: the self-transfer moves nothing but is still counted as seized', async () => {
    const indexer = await setup()
    const seeded = {
      ...createDefaultPosition(BORROWER_ID, POOL_ID, '0xold', 1n, 1n),
      shares: [SEIZED_L_SHARES, 0n, 0n, 0n, 0n, 0n],
      assets: [SEIZED_L_ASSETS, 0n, 0n, 0n, 0n, 0n],
      principal: SEIZED_L_ASSETS,
    }
    indexer.Position.set(seeded)
    await run(indexer, [seizeDepositL(BORROWER, 1), liquidate(BORROWER, 1n, 2, { x: 0n, y: 0n })])
    const position = await indexer.Position.getOrThrow(BORROWER_POSITION_ID)
    expect(position.shares).toEqual(seeded.shares)
    expect(position.assets).toEqual(seeded.assets)
    expect(position.principal).toBe(seeded.principal)
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 2))
    expect(liq.borrower_id).toBe(BORROWER_ID)
    expect(liq.recipient_id).toBe(BORROWER_ID)
    expect(liq.seizedLAssets).toBe(SEIZED_L_ASSETS)
  })

  it('gives each of two borrowers liquidated in one transaction only their own amounts', async () => {
    const indexer = await setup()
    const shares1 = 100_000_000_000_000n
    const shares2 = 250_000_000_000_000n
    await run(indexer, [
      seizeDepositL(POOL, 1, BORROWER, shares1),
      seizeDepositL(POOL, 2, BORROWER2, shares2),
      repayX(BOT, 100n, 90n, 3, BORROWER),
      transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 90n, 4),
      repayX(BOT, 40n, 36n, 5, BORROWER2),
      transfer('ERC4626Debt', DEBT_X, BORROWER2, ZERO, 36n, 6),
      liquidate(POOL, 0n, 7, { x: 0n, y: 0n }, MAIN_TX, BORROWER),
      liquidate(POOL, 0n, 8, { x: 0n, y: 0n }, MAIN_TX, BORROWER2),
    ])
    const first = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 7))
    const second = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 8))
    expect(first.borrower_id).toBe(BORROWER_ID)
    expect(first.seizedLAssets).toBe(toAssets(shares1, 4135179192327097n, 4118135293355570n))
    expect(first.repaidDebtXAssets).toBe(100n)
    expect(second.borrower_id).toBe(BORROWER2_ID)
    expect(second.seizedLAssets).toBe(toAssets(shares2, 4135179192327097n, 4118135293355570n))
    expect(second.repaidDebtXAssets).toBe(40n)
  })

  it('snapshots the reserves left by a write-off Sync before the Liquidate', async () => {
    const indexer = await setup()
    await run(indexer, [
      repayX(POOL, 700n, 650n, 1),
      transfer('ERC4626Debt', DEBT_X, BORROWER, ZERO, 650n, 2),
      burnBadDebt(4n, 700n, 650n, 3),
      sync(30_000_000_000n, 500_000_000_000_000_000_000n, 4),
      liquidate(POOL, 0n, 5),
    ])
    const liq = await indexer.Liquidate.getOrThrow(getEventId(CHAIN, HASH, 5))
    expect(liq.reserveX).toBe(30_000_000_000n)
    expect(liq.reserveY).toBe(500_000_000_000_000_000_000n)
    expect(liq.badDebtXAssets).toBe(700n)
    expect(liq.repaidDebtXAssets).toBe(0n)
  })
})
