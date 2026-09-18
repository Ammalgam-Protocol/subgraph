import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { getEventId, getPositionId, scopedId } from '../../src/utils/id'
import { toAssets } from '../../src/utils/math'
import { createDefaultPool } from '../../src/utils/pool'
import {
  lendingTokensCreatedRegistration,
  pairCreatedRegistration,
  testBlockNumber,
} from './testBlock'

const CHAIN = 11155111
const POOL: `0x${string}` = '0xaa01000000000000000000000000000000000001'
const TX: `0x${string}` = '0xaaa0000000000000000000000000000000000001'
const TY: `0x${string}` = '0xbbb0000000000000000000000000000000000002'
const LEND_X: `0x${string}` = '0x00000000000000000000000000000000000000d1'
const LEND_Y: `0x${string}` = '0x00000000000000000000000000000000000000d2'
const LEND_L: `0x${string}` = '0x00000000000000000000000000000000000000d0'
const LEND_BX: `0x${string}` = '0x00000000000000000000000000000000000000d4'
const LEND_BL: `0x${string}` = '0x00000000000000000000000000000000000000d3'
const UNUSED_LEND_BY: `0x${string}` = '0x00000000000000000000000000000000000000e1'
const ALICE: `0x${string}` = '0xc0de000000000000000000000000000000000001'
const BOB: `0x${string}` = '0xc0de000000000000000000000000000000000002'
const BORROWER: `0x${string}` = '0xb00b000000000000000000000000000000000001'
const FEE_TO: `0x${string}` = '0xfee0000000000000000000000000000000000001'
const ZERO: `0x${string}` = '0x0000000000000000000000000000000000000000'

const POOL_ID = scopedId(CHAIN, POOL)
const TX_ID = scopedId(CHAIN, TX)
const TY_ID = scopedId(CHAIN, TY)
const LEND_X_ID = scopedId(CHAIN, LEND_X)
const LEND_Y_ID = scopedId(CHAIN, LEND_Y)
const LEND_L_ID = scopedId(CHAIN, LEND_L)
const LEND_BX_ID = scopedId(CHAIN, LEND_BX)
const LEND_BL_ID = scopedId(CHAIN, LEND_BL)
const ALICE_ID = scopedId(CHAIN, ALICE)
const BOB_ID = scopedId(CHAIN, BOB)

// Every test calls this first; the seed*() helpers below overwrite what factory.ts's onEvent creates.
async function registerAll(indexer: ReturnType<typeof createTestIndexer>) {
  await indexer.process({
    chains: {
      11155111: {
        simulate: [
          lendingTokensCreatedRegistration({
            pair: POOL,
            depositL: LEND_L,
            depositX: LEND_X,
            depositY: LEND_Y,
            borrowL: LEND_BL,
            borrowX: LEND_BX,
            borrowY: UNUSED_LEND_BY,
          }),
          pairCreatedRegistration({ pair: POOL, tokenX: TX, tokenY: TY }),
        ],
      },
    },
  })
}

function seedLendingToken(
  indexer: ReturnType<typeof createTestIndexer>,
  id: string,
  poolId: string,
  tokenType: number,
) {
  indexer.LendingToken.set({
    id,
    symbol: 'aTK',
    name: 'Ammalgam TK',
    decimals: 18,
    pool_id: poolId,
    tokenType,
    pendingAssets: undefined,
    pendingShares: undefined,
  })
}

function seedPool(
  indexer: ReturnType<typeof createTestIndexer>,
  overrides?: Partial<{
    totalAssets: bigint[]
    totalShares: bigint[]
    reserveX: bigint
    reserveY: bigint
  }>,
) {
  const pool = createDefaultPool(POOL_ID, TX_ID, TY_ID, 'X-Y', 1n, 1n)
  indexer.Pool.set({ ...pool, ...overrides })
}

function seedTokens(indexer: ReturnType<typeof createTestIndexer>) {
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
}

function depositTransfer(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_X,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

function debtTransfer(from: `0x${string}`, to: `0x${string}`, value: bigint, logIndex: number) {
  return {
    contract: 'ERC4626Debt' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_BX,
    logIndex,
    block: { number: testBlockNumber(10), timestamp: 100 },
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

function debtLiquidityTransfer(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC20DebtLiquidity' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_BL,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

function burnBadDebt(
  tokenType: bigint,
  badDebtAssets: bigint,
  badDebtShares: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'BurnBadDebt' as const,
    srcAddress: POOL,
    logIndex,
    block,
    transaction: { hash: '0xbbd', from: ALICE },
    params: { borrower: BORROWER, tokenType, badDebtAssets, badDebtShares },
  }
}

function depositLTransfer(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC20DepositLiquidity' as const,
    event: 'Transfer' as const,
    srcAddress: LEND_L,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

function mintLAction(
  sender: `0x${string}`,
  to: `0x${string}`,
  assets: bigint,
  shares: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC20DepositLiquidity' as const,
    event: 'Mint' as const,
    srcAddress: LEND_L,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { sender, to, assets, shares },
  }
}

function burnLAction(
  sender: `0x${string}`,
  to: `0x${string}`,
  assets: bigint,
  shares: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC20DepositLiquidity' as const,
    event: 'Burn' as const,
    srcAddress: LEND_L,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { sender, to, assets, shares },
  }
}

function borrowLAction(
  sender: `0x${string}`,
  to: `0x${string}`,
  assets: bigint,
  shares: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC20DebtLiquidity' as const,
    event: 'BorrowLiquidity' as const,
    srcAddress: LEND_BL,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { sender, to, assets, shares },
  }
}

// Deposit/Withdraw event for whichever lending token (X or Y) the test needs.
function depositAction(
  lendingToken: `0x${string}`,
  sender: `0x${string}`,
  owner: `0x${string}`,
  assets: bigint,
  shares: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Deposit' as const,
    srcAddress: lendingToken,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { sender, owner, assets, shares },
  }
}

function withdrawAction(
  lendingToken: `0x${string}`,
  sender: `0x${string}`,
  receiver: `0x${string}`,
  assets: bigint,
  shares: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Withdraw' as const,
    srcAddress: lendingToken,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { sender, receiver, assets, shares },
  }
}

// Transfer event for whichever lending token (X or Y) the test needs.
// `depositTransfer` above stays as the X-only shorthand other tests already use.
function erc4626Transfer(
  lendingToken: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'ERC4626Deposit' as const,
    event: 'Transfer' as const,
    srcAddress: lendingToken,
    logIndex,
    block,
    transaction: { hash: '0xt', from: ALICE },
    params: { from, to, value },
  }
}

function syncEvent(
  reserveXAssets: bigint,
  reserveYAssets: bigint,
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'Sync' as const,
    srcAddress: POOL,
    logIndex,
    block,
    transaction: { hash: '0xsync', from: ALICE },
    params: { reserveXAssets, reserveYAssets },
  }
}

function swapEvent(
  params: { amountXIn: bigint; amountYIn: bigint; amountXOut: bigint; amountYOut: bigint },
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'Swap' as const,
    srcAddress: POOL,
    logIndex,
    block,
    transaction: { hash: '0xswap', from: ALICE },
    params: { sender: ALICE, to: ALICE, ...params },
  }
}

function interestAccruedEvent(
  params: {
    reserveXAssets: bigint
    reserveYAssets: bigint
    depositXAssets: bigint
    depositYAssets: bigint
    borrowLAssets: bigint
    borrowXAssets: bigint
    borrowYAssets: bigint
  },
  logIndex: number,
  block: { number: number; timestamp: number } = { number: testBlockNumber(10), timestamp: 100 },
) {
  return {
    contract: 'AmmalgamPair' as const,
    event: 'InterestAccrued' as const,
    srcAddress: POOL,
    logIndex,
    block,
    transaction: { hash: '0xia', from: ALICE },
    params,
  }
}

describe('cross-handler invariants and sequences', () => {
  it('reconstruction invariant holds across mint/mint/move/burn', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            depositTransfer(ZERO, ALICE, 100n, 0),
            depositTransfer(ZERO, BOB, 50n, 1),
            depositTransfer(ALICE, BOB, 30n, 2),
            depositTransfer(BOB, ZERO, 20n, 3),
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const positions = await indexer.Position.getAll()
    for (let t = 0; t < 6; t++) {
      const sum = positions.reduce((acc, p) => acc + (p.shares[t] ?? 0n), 0n)
      expect(sum).toBe(pool.totalShares[t])
    }
    // sanity: not a vacuous all-zero check
    expect(pool.totalShares[1]).toBe(130n)
  })

  it('facade debt-token mint-then-forward attributes shares to the final recipient', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_BX_ID, POOL_ID, 4)
    seedPool(indexer)
    await indexer.process({
      chains: {
        11155111: {
          simulate: [debtTransfer(ZERO, LEND_BX, 100n, 0), debtTransfer(LEND_BX, ALICE, 100n, 1)],
        },
      },
    })
    const alice = await indexer.Position.getOrThrow(getPositionId(ALICE_ID, POOL_ID))
    expect(alice.shares[4]).toBe(100n)
    const intermediary = await indexer.Position.getOrThrow(getPositionId(LEND_BX_ID, POOL_ID))
    expect(intermediary.shares[4]).toBe(0n)
  })

  it('protocol-fee mint after InterestAccrued reconstructs via snapshot-then-delta', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
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
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    const seededShares = 200n
    seedPool(indexer, { totalShares: [0n, seededShares, 0n, 0n, 0n, 0n] })

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamPair' as const,
              event: 'InterestAccrued' as const,
              srcAddress: POOL,
              logIndex: 0,
              block: { number: testBlockNumber(20), timestamp: 200 },
              transaction: { hash: '0xfee', from: ALICE },
              params: {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 0n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
            depositTransfer(ZERO, FEE_TO, 10n, 1, { number: testBlockNumber(20), timestamp: 200 }),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[1]).toBe(500n + toAssets(10n, 500n, seededShares))
  })

  it('debt-burn zeroes the borrower and pool totals for the burned tokenType', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_BX_ID, POOL_ID, 4)
    seedPool(indexer, {
      totalAssets: [0n, 0n, 0n, 0n, 100n, 0n],
      totalShares: [0n, 0n, 0n, 0n, 100n, 0n],
    })
    indexer.Position.set({
      id: getPositionId(BOB_ID, POOL_ID),
      user_id: BOB_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 0n, 0n, 0n, 100n, 0n],
      shares: [0n, 0n, 0n, 0n, 100n, 0n],
      principal: 0n,
      depositCount: 0,
      withdrawCount: 0,
      borrowCount: 0,
      repayCount: 0,
      transferredCount: 0,
      receivedCount: 0,
    })
    await indexer.process({
      chains: { 11155111: { simulate: [debtTransfer(BOB, ZERO, 100n, 0)] } },
    })
    const bob = await indexer.Position.getOrThrow(getPositionId(BOB_ID, POOL_ID))
    expect(bob.shares[4]).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalShares[4]).toBe(0n)
  })

  it('bad-debt leftover hop nets the pair position and writes no Transfer entity', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer, {
      totalAssets: [0n, 300n, 0n, 0n, 0n, 0n],
      totalShares: [0n, 100n, 0n, 0n, 0n, 0n],
    })
    indexer.Position.set({
      id: getPositionId(BOB_ID, POOL_ID),
      user_id: BOB_ID,
      pool_id: POOL_ID,
      hash: '0x',
      blockNumber: 1n,
      timestamp: 1n,
      assets: [0n, 300n, 0n, 0n, 0n, 0n],
      shares: [0n, 100n, 0n, 0n, 0n, 0n],
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
          simulate: [depositTransfer(BOB, POOL, 40n, 0), depositTransfer(POOL, ZERO, 40n, 1)],
        },
      },
    })
    const pair = await indexer.Position.getOrThrow(getPositionId(POOL_ID, POOL_ID))
    expect(pair.shares[1]).toBe(0n)
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // totals shrink by the burn leg only (40 shares / toAssets(40,300,100)=120 assets):
    // the pool-bound move leaves totals untouched.
    expect(pool.totalShares[1]).toBe(60n)
    expect(pool.totalAssets[1]).toBe(180n)
    expect(await indexer.Transfer.getAll()).toHaveLength(0)
  })

  it('protocolFeesTokenX equals the raw sum of flagged Deposit amounts', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer)
    const feeDeposit = (logIndex: number, assets: bigint, sender: `0x${string}`) => ({
      contract: 'ERC4626Deposit' as const,
      event: 'Deposit' as const,
      srcAddress: LEND_X,
      logIndex,
      block: { number: testBlockNumber(10), timestamp: 100 },
      transaction: { hash: '0xinv', from: ALICE },
      params: { sender, owner: sender === POOL ? FEE_TO : ALICE, assets, shares: 1n },
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            feeDeposit(0, 1500000000000000000n, POOL),
            feeDeposit(1, 5000000000000000000n, ALICE),
            feeDeposit(2, 500000000000000000n, POOL),
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const deposits = await indexer.Deposit.getAll()
    const flaggedSum = deposits
      .filter((deposit) => deposit.isProtocolFee)
      .reduce((acc, deposit) => acc + deposit.amount, 0n)
    expect(flaggedSum).toBe(2000000000000000000n) // sanity: not vacuous
    expect(pool.protocolFeesTokenX.toString()).toBe('2000000000000000000')
  })

  it('penaltiesTokenL equals the raw sum of flagged Borrow amounts', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer)
    const borrowLiquidity = (logIndex: number, assets: bigint, sender: `0x${string}`) => ({
      contract: 'ERC20DebtLiquidity' as const,
      event: 'BorrowLiquidity' as const,
      srcAddress: LEND_BL,
      logIndex,
      block: { number: testBlockNumber(10), timestamp: 100 },
      transaction: { hash: '0xpen', from: ALICE },
      // Penalties are minted to the pair itself, user borrows to the borrower.
      params: { sender, to: sender === POOL ? POOL : ALICE, assets, shares: 1n },
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            borrowLiquidity(0, 1500000000000000000n, POOL),
            borrowLiquidity(1, 2001000000000000000n, ALICE),
            borrowLiquidity(2, 500000000000000000n, POOL),
          ],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const borrows = await indexer.Borrow.getAll()
    const flaggedSum = borrows
      .filter((borrow) => borrow.isPenalty)
      .reduce((acc, borrow) => acc + borrow.amount, 0n)
    expect(flaggedSum).toBe(2000000000000000000n) // sanity: not vacuous
    expect(pool.penaltiesTokenL.toString()).toBe('2000000000000000000')
  })

  it("BurnBadDebt on BORROW_L lands the preceding Transfer burn's re-derive once, not twice (D10)", async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 400n,
      reserveY: 400n,
      totalAssets: [700n, 0n, 0n, 300n, 0n, 0n], // isqrt(400*400) + 300 = 700, consistent
      totalShares: [0n, 0n, 0n, 300n, 0n, 0n],
    })
    await indexer.process({
      chains: {
        11155111: {
          simulate: [debtLiquidityTransfer(ALICE, ZERO, 50n, 0), burnBadDebt(3n, 50n, 50n, 1)],
        },
      },
    })
    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // Transfer burn alone re-derives to isqrt(400*400) + 250 = 650; a BORROW_L decrement on top
    // of that would double-count the burn and land 600 instead.
    expect(pool.totalAssets[3]).toBe(250n)
    expect(pool.totalAssets[0]).toBe(650n)
  })

  it('a BORROW_L penalty mint before InterestAccrued is not double-counted (D10)', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
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
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 300n,
      reserveY: 300n,
      totalAssets: [300n, 0n, 0n, 0n, 0n, 0n], // isqrt(300*300) + 0 = 300, consistent
      totalShares: [0n, 0n, 0n, 0n, 0n, 0n],
    })

    // 10 L of penalty lands at its own Transfer mint; 5 L of LP interest accrues on top in the
    // same block, so the accrual's borrowLAssets (15) already includes both. D10 re-derives after each.
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            debtLiquidityTransfer(ZERO, ALICE, 10n, 0),
            {
              contract: 'AmmalgamPair' as const,
              event: 'InterestAccrued' as const,
              srcAddress: POOL,
              logIndex: 1,
              block: { number: testBlockNumber(10), timestamp: 100 },
              transaction: { hash: '0xia', from: ALICE },
              params: {
                reserveXAssets: 300n,
                reserveYAssets: 300n,
                depositXAssets: 0n,
                depositYAssets: 0n,
                borrowLAssets: 15n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
            },
          ],
        },
      },
    })
    const afterAccrual = await indexer.Pool.getOrThrow(POOL_ID)
    expect(afterAccrual.totalAssets[0]).toBe(315n) // 300 + 10 (penalty) + 5 (LP interest), once each
  })
})

describe('ledger identity (D8): five directional isolations, on a 1000/1000 pool', () => {
  it('a 100/200 imbalanced mint grows depositL by 148, with 100 in the Mint row', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedTokens(indexer)
    seedLendingToken(indexer, LEND_L_ID, POOL_ID, 0)
    seedPool(indexer, {
      reserveX: 1000n,
      reserveY: 1000n,
      totalAssets: [1000n, 1000n, 1000n, 0n, 0n, 0n],
      totalShares: [1000n, 1000n, 1000n, 0n, 0n, 0n],
    })
    const depositLStart = (await indexer.Pool.getOrThrow(POOL_ID)).totalAssets[0]

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            mintLAction(BORROWER, ALICE, 100n, 100n, 0),
            depositLTransfer(ZERO, ALICE, 100n, 1),
            // The declared mint (100) is imbalanced: it actually backs a 100 X / 200 Y reserve
            // move, so Sync's full re-derive from the real reserves, not the Mint row, sets
            // the final depositL. isqrt(1100*1200) = 1148.
            syncEvent(1100n, 1200n, 2),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0] - depositLStart).toBe(148n)
    const mint = await indexer.Deposit.getOrThrow(getEventId(CHAIN, '0xt', 0))
    expect(mint.amount).toBe(100n)
  })

  it('an 80/80 repay of 50 L owed (L over-repay) grows depositL by 30', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedTokens(indexer)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 1000n,
      reserveY: 1000n,
      totalAssets: [1050n, 1000n, 1000n, 50n, 0n, 0n],
      totalShares: [1050n, 1000n, 1000n, 50n, 0n, 0n],
    })
    const depositLStart = (await indexer.Pool.getOrThrow(POOL_ID)).totalAssets[0]

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'ERC20DebtLiquidity' as const,
              event: 'RepayLiquidity' as const,
              srcAddress: LEND_BL,
              logIndex: 0,
              block: { number: testBlockNumber(10), timestamp: 100 },
              transaction: { hash: '0xrl', from: BORROWER },
              params: { sender: BORROWER, onBehalfOf: BORROWER, assets: 50n, shares: 50n },
            },
            debtLiquidityTransfer(BORROWER, ZERO, 50n, 1),
            // 80 X + 80 Y actually paid in vs 50 L owed: the 30 L surplus lands as reserve
            // growth, not a debt reduction, once Sync re-derives from the real post-repay
            // reserves. isqrt(1080*1080) = 1080.
            syncEvent(1080n, 1080n, 2),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0] - depositLStart).toBe(30n)
  })

  it('50 L of bad debt shrinks depositL by 50', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 1000n,
      reserveY: 1000n,
      totalAssets: [1050n, 1000n, 1000n, 50n, 0n, 0n],
      totalShares: [1050n, 1000n, 1000n, 50n, 0n, 0n],
    })
    const depositLStart = (await indexer.Pool.getOrThrow(POOL_ID)).totalAssets[0]

    await indexer.process({
      chains: {
        11155111: {
          simulate: [debtLiquidityTransfer(BORROWER, ZERO, 50n, 0), burnBadDebt(3n, 50n, 50n, 1)],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // The debt-share burn alone re-derives depositL down by the 50 borrowL it closed; BurnBadDebt
    // on tokenType BORROW_L has no totalAssets branch of its own, so nothing double-counts it.
    expect(pool.totalAssets[0] - depositLStart).toBe(-50n)
  })

  it('a 50 X deposit that crosses the depletion boundary grows depositL by 225, with no L event', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer, {
      reserveX: 1000n,
      reserveY: 999n,
      // missingX = borrowX(1070) - depositX(100) = 970; reserveX*19 < missingX*20 -> depleted.
      totalAssets: [774n, 100n, 999n, 0n, 1070n, 0n],
      totalShares: [774n, 100n, 999n, 0n, 1070n, 0n],
    })
    const depositLStart = (await indexer.Pool.getOrThrow(POOL_ID)).totalAssets[0]

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            depositAction(LEND_X, BORROWER, ALICE, 50n, 50n, 0),
            depositTransfer(ZERO, ALICE, 50n, 1),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    // missingX after = 1070 - 150 = 920; reserveX*19 >= missingX*20 -> no longer depleted, a
    // discontinuous jump in the active-liquidity term with no yield/capital-flow column for it.
    expect(pool.totalAssets[0] - depositLStart).toBe(225n)
    const deposits = await indexer.Deposit.getAll()
    expect(deposits).toHaveLength(1)
    expect(deposits[0]?.asset_id).toBe(LEND_X_ID) // no DEPOSIT_L Deposit row: no L event at all
  })

  it('the reverse withdrawal drops depositL by the same 225', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedPool(indexer, {
      reserveX: 1000n,
      reserveY: 999n,
      totalAssets: [999n, 150n, 999n, 0n, 1070n, 0n],
      totalShares: [999n, 150n, 999n, 0n, 1070n, 0n],
    })
    const depositLStart = (await indexer.Pool.getOrThrow(POOL_ID)).totalAssets[0]

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            withdrawAction(LEND_X, BORROWER, ALICE, 50n, 50n, 0),
            depositTransfer(ALICE, ZERO, 50n, 1),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    expect(pool.totalAssets[0] - depositLStart).toBe(-225n)
  })
})

describe('ledger identity (D8): mixed sequence', () => {
  it('yield + capital flow == ΔdepositL, within 1 L-wei, across swap/accrual/fee-mint/penalty/borrowLiquidity/mint/burn', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
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
    seedLendingToken(indexer, LEND_L_ID, POOL_ID, 0)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 100000n,
      reserveY: 100000n,
      totalAssets: [100000n, 100000n, 100000n, 0n, 0n, 0n],
      totalShares: [100000n, 100000n, 100000n, 0n, 0n, 0n],
    })
    const depositLStart = (await indexer.Pool.getOrThrow(POOL_ID)).totalAssets[0]

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            // Swap: 10,000 X in for 9,000 Y out retains a fee (post-swap K grows).
            swapEvent({ amountXIn: 10000n, amountYIn: 0n, amountXOut: 0n, amountYOut: 9000n }, 0),
            syncEvent(110000n, 91000n, 1),
            // Accrual: gross/protocol/LP interest on X, Y and L in one event.
            interestAccruedEvent(
              {
                reserveXAssets: 111000n,
                reserveYAssets: 91800n,
                depositXAssets: 100000n,
                depositYAssets: 100000n,
                borrowLAssets: 500n,
                borrowXAssets: 1000n,
                borrowYAssets: 800n,
              },
              2,
            ),
            // gross L 500 mints protocol L 50: the fee backout and Transfer add cancel, leaving
            // net L interest for holders.
            mintLAction(POOL, FEE_TO, 50n, 50n, 3),
            depositLTransfer(ZERO, FEE_TO, 50n, 4),
            // Penalty: 200 L minted as borrow L to the pair itself.
            borrowLAction(POOL, POOL, 200n, 200n, 5),
            debtLiquidityTransfer(ZERO, POOL, 200n, 6),
            // User borrowLiquidity: 400 L of new debt, redeemed against reserves at the
            // pre-borrow active liquidity, so the paired Sync nets this step to ~0 on depositL,
            // because there is no capital-flow column for a raw borrowL mint.
            borrowLAction(ALICE, BORROWER, 400n, 400n, 7),
            debtLiquidityTransfer(ZERO, BORROWER, 400n, 8),
            syncEvent(110561n, 91437n, 9),
            // User mint and burn of deposit L: direct capital flow, no reserve backing move.
            mintLAction(BOB, ALICE, 1000n, 1000n, 10),
            depositLTransfer(ZERO, ALICE, 1000n, 11),
            burnLAction(BOB, ALICE, 300n, 300n, 12),
            depositLTransfer(ALICE, ZERO, 300n, 13),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const deposits = await indexer.Deposit.getAll()
    const withdraws = await indexer.Withdraw.getAll()
    const depositLMinted = deposits
      .filter((d) => d.asset_id === LEND_L_ID && !d.isProtocolFee)
      .reduce((acc, d) => acc + d.amount, 0n)
    const depositLBurned = withdraws
      .filter((w) => w.asset_id === LEND_L_ID)
      .reduce((acc, w) => acc + w.amount, 0n)

    const actualDepositLDelta = pool.totalAssets[0] - depositLStart
    const expectedDepositLDelta =
      depositLMinted -
      depositLBurned +
      pool.swapFeesTokenL +
      pool.grossInterestTokenL +
      pool.lpInterestTokenL +
      pool.penaltiesTokenL +
      (pool.protocolFeesTokenL - pool.protocolInterestTokenL)

    // sanity: not a vacuous all-zero identity
    expect(actualDepositLDelta).not.toBe(0n)
    expect(pool.swapFeesTokenL).not.toBe(0n)
    expect(pool.lpInterestTokenL).not.toBe(0n)
    expect(depositLMinted).toBe(1000n)
    expect(depositLBurned).toBe(300n)

    // Delta dust bound: one real floor-division derive in this sequence (the borrowLiquidity
    // redemption's L-to-X/Y conversion) can round down by at most 1 L-wei.
    const MAX_DELTA_DUST_L = 1n
    const dust = actualDepositLDelta - expectedDepositLDelta
    expect(dust >= -MAX_DELTA_DUST_L && dust <= MAX_DELTA_DUST_L).toBe(true)
  })
})

describe('cross-column invariants', () => {
  // dailyFees/protocolRevenue aren't stored columns: this reproduces the per-leg adapter
  // formula so the invariant can be checked without those columns existing yet.
  function dailyFeesAndRevenue(
    row: {
      swapFeesTokenX: bigint
      swapFeesTokenY: bigint
      grossInterestTokenX: bigint
      grossInterestTokenY: bigint
      grossInterestTokenLAsX: bigint
      grossInterestTokenLAsY: bigint
      protocolInterestTokenX: bigint
      protocolInterestTokenY: bigint
      protocolInterestTokenLAsX: bigint
      protocolInterestTokenLAsY: bigint
      protocolFeesTokenX: bigint
      protocolFeesTokenY: bigint
      protocolFeesTokenLAsX: bigint
      protocolFeesTokenLAsY: bigint
      penaltiesTokenLAsX: bigint
      penaltiesTokenLAsY: bigint
    },
    leg: 'X' | 'Y',
  ) {
    const protocolRevenue = row[`protocolFeesToken${leg}`] + row[`protocolFeesTokenLAs${leg}`]
    const borrowerFees =
      protocolRevenue - (row[`protocolInterestToken${leg}`] + row[`protocolInterestTokenLAs${leg}`])
    const dailyFees =
      row[`swapFeesToken${leg}`] +
      row[`grossInterestToken${leg}`] +
      row[`grossInterestTokenLAs${leg}`] +
      borrowerFees +
      row[`penaltiesTokenLAs${leg}`]
    return { borrowerFees, dailyFees, protocolRevenue }
  }

  it('pure-L interest preserves the documented consumer identity for Pool and PoolDayData', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedTokens(indexer)
    seedLendingToken(indexer, LEND_L_ID, POOL_ID, 0)
    seedPool(indexer, {
      reserveX: 1000n,
      reserveY: 1000n,
      totalAssets: [1000n, 500n, 500n, 0n, 0n, 0n],
      totalShares: [1000n, 500n, 500n, 0n, 0n, 0n],
    })
    const block = { number: testBlockNumber(10), timestamp: 100 }

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            interestAccruedEvent(
              {
                reserveXAssets: 1000n,
                reserveYAssets: 1000n,
                depositXAssets: 500n,
                depositYAssets: 500n,
                borrowLAssets: 100n,
                borrowXAssets: 0n,
                borrowYAssets: 0n,
              },
              0,
              block,
            ),
            syncEvent(1000n, 1000n, 1, block),
            mintLAction(POOL, FEE_TO, 10n, 10n, 2, block),
            depositLTransfer(ZERO, FEE_TO, 10n, 3, block),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const dayData = await indexer.PoolDayData.getOrThrow(`${POOL_ID}-0`)

    // Pure-L accrual (no X/Y interest) must still satisfy the Pool/PoolDayData consumer
    // identity: dailyFees - protocolRevenue is the LP's share.
    for (const row of [pool, dayData]) {
      expect(row.grossInterestTokenL).toBe(100n)
      expect(row.grossInterestTokenLAsX).toBe(100n)
      expect(row.grossInterestTokenLAsY).toBe(100n)
      expect(row.protocolInterestTokenL).toBe(10n)
      expect(row.protocolInterestTokenLAsX).toBe(10n)
      expect(row.protocolInterestTokenLAsY).toBe(10n)
      expect(row.protocolFeesTokenL).toBe(10n)
      expect(row.protocolFeesTokenLAsX).toBe(10n)
      expect(row.protocolFeesTokenLAsY).toBe(10n)

      for (const leg of ['X', 'Y'] as const) {
        const { borrowerFees, dailyFees, protocolRevenue } = dailyFeesAndRevenue(row, leg)
        expect(protocolRevenue).toBe(10n)
        expect(borrowerFees).toBe(0n)
        expect(dailyFees).toBe(100n)
        expect(dailyFees - protocolRevenue).toBe(90n)
      }
    }
  })

  it('dailyFees >= protocolRevenue, and protocolInterestToken* <= protocolFeesToken* and <= grossInterestToken*, for X, Y, L', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedTokens(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedLendingToken(indexer, LEND_Y_ID, POOL_ID, 2)
    seedLendingToken(indexer, LEND_L_ID, POOL_ID, 0)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 10000n,
      reserveY: 10000n,
      totalAssets: [10000n, 10000n, 10000n, 0n, 0n, 0n],
      totalShares: [10000n, 10000n, 10000n, 0n, 0n, 0n],
    })

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            swapEvent({ amountXIn: 1000n, amountYIn: 0n, amountXOut: 0n, amountYOut: 900n }, 0),
            syncEvent(11000n, 9100n, 1),
            interestAccruedEvent(
              {
                reserveXAssets: 11000n,
                reserveYAssets: 9100n,
                depositXAssets: 10000n,
                depositYAssets: 10000n,
                borrowLAssets: 500n,
                borrowXAssets: 1000n,
                borrowYAssets: 800n,
              },
              2,
            ),
            // protocolFeesTokenX/Y minted strictly above protocolInterestTokenX/Y (100, 80), so
            // the <= checks below are non-vacuous.
            depositAction(LEND_X, POOL, FEE_TO, 250n, 250n, 3),
            depositTransfer(ZERO, FEE_TO, 250n, 4),
            depositAction(LEND_Y, POOL, FEE_TO, 200n, 200n, 5),
            erc4626Transfer(LEND_Y, ZERO, FEE_TO, 200n, 6),
            // protocolFeesTokenL is strictly above protocolInterestTokenL (50).
            mintLAction(POOL, FEE_TO, 550n, 550n, 7),
            depositLTransfer(ZERO, FEE_TO, 550n, 8),
            borrowLAction(POOL, POOL, 100n, 100n, 9),
            debtLiquidityTransfer(ZERO, POOL, 100n, 10),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)

    for (const leg of ['X', 'Y'] as const) {
      const { dailyFees, protocolRevenue } = dailyFeesAndRevenue(pool, leg)
      expect(dailyFees >= protocolRevenue).toBe(true)
    }

    for (const leg of ['X', 'Y', 'L'] as const) {
      const protocolInterest = pool[`protocolInterestToken${leg}`]
      const protocolFees = pool[`protocolFeesToken${leg}`]
      const grossInterest = pool[`grossInterestToken${leg}`]
      expect(protocolInterest <= protocolFees).toBe(true)
      expect(protocolInterest <= grossInterest).toBe(true)
      // sanity: not a vacuous 0 <= 0
      expect(protocolFees > 0n).toBe(true)
    }
  })

  it('sums every fee column on PoolDayData to the matching Pool column, across a day boundary', async () => {
    const indexer = createTestIndexer()
    await registerAll(indexer)
    seedTokens(indexer)
    seedLendingToken(indexer, LEND_X_ID, POOL_ID, 1)
    seedLendingToken(indexer, LEND_BL_ID, POOL_ID, 3)
    seedPool(indexer, {
      reserveX: 5000n,
      reserveY: 5000n,
      totalAssets: [5000n, 5000n, 5000n, 0n, 0n, 0n],
      totalShares: [5000n, 5000n, 5000n, 0n, 0n, 0n],
    })
    const DAY1 = { number: testBlockNumber(10), timestamp: 100 }
    const DAY2 = { number: testBlockNumber(20), timestamp: 100000 } // floor(100000/86400)*86400 != floor(100/86400)*86400

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            swapEvent(
              { amountXIn: 500n, amountYIn: 0n, amountXOut: 0n, amountYOut: 450n },
              0,
              DAY1,
            ),
            syncEvent(5500n, 4550n, 1, DAY1),
            swapEvent(
              { amountXIn: 300n, amountYIn: 0n, amountXOut: 0n, amountYOut: 260n },
              2,
              DAY2,
            ),
            syncEvent(5800n, 4290n, 3, DAY2),
            interestAccruedEvent(
              {
                reserveXAssets: 5800n,
                reserveYAssets: 4290n,
                depositXAssets: 5000n,
                depositYAssets: 5000n,
                borrowLAssets: 100n,
                borrowXAssets: 200n,
                borrowYAssets: 150n,
              },
              4,
              DAY2,
            ),
            depositAction(LEND_X, POOL, FEE_TO, 20n, 20n, 5, DAY2),
            depositTransfer(ZERO, FEE_TO, 20n, 6, DAY2),
            borrowLAction(POOL, POOL, 30n, 30n, 7, DAY2),
            debtLiquidityTransfer(ZERO, POOL, 30n, 8, DAY2),
          ],
        },
      },
    })

    const pool = await indexer.Pool.getOrThrow(POOL_ID)
    const days = await indexer.PoolDayData.getAll()
    expect(days).toHaveLength(2) // sanity: this really is a two-row check, not a one-row tautology

    const feeColumns = [
      'swapFeesTokenX',
      'swapFeesTokenY',
      'swapFeesTokenL',
      'grossInterestTokenX',
      'grossInterestTokenY',
      'grossInterestTokenL',
      'grossInterestTokenLAsX',
      'grossInterestTokenLAsY',
      'protocolInterestTokenX',
      'protocolInterestTokenY',
      'protocolInterestTokenL',
      'protocolInterestTokenLAsX',
      'protocolInterestTokenLAsY',
      'lpInterestTokenL',
      'lpInterestTokenLAsX',
      'lpInterestTokenLAsY',
      'protocolFeesTokenX',
      'protocolFeesTokenY',
      'protocolFeesTokenL',
      'protocolFeesTokenLAsX',
      'protocolFeesTokenLAsY',
      'penaltiesTokenL',
      'penaltiesTokenLAsX',
      'penaltiesTokenLAsY',
    ] as const

    let nonZeroColumns = 0
    for (const column of feeColumns) {
      const summed = days.reduce((acc, day) => acc + day[column], 0n)
      expect(summed).toBe(pool[column])
      if (summed > 0n) nonZeroColumns++
    }
    // sanity: this sequence actually exercised most of the ledger, not just a couple of columns
    expect(nonZeroColumns).toBeGreaterThan(10)
  })
})
