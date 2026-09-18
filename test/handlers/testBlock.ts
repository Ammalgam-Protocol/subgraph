// config.yaml pins the chain's start_block and simulate drops events below it. Handler tests
// number blocks relatively to express ordering, so offset them above that floor.
export const TEST_START_BLOCK = 11185304

export function testBlockNumber(offset: number): number {
  return TEST_START_BLOCK + offset
}

type Address = `0x${string}`

/**
 * Puts the four lending-token addresses on simulate's allowlist: an event on an
 * ERC4626Deposit/ERC4626Debt/ERC20DepositLiquidity/ERC20DebtLiquidity address is dropped
 * unless contractRegister saw it earlier in the same run. Firing the real event also runs
 * factory.ts's onEvent, which creates the LendingToken rows with pending* left unset.
 * blockOffset must never go backwards: simulate requires each call's block >= the last.
 */
export function lendingTokensCreatedRegistration(params: {
  pair: Address
  depositL: Address
  depositX: Address
  depositY: Address
  borrowL: Address
  borrowX: Address
  borrowY: Address
  blockOffset?: number
}) {
  return {
    contract: 'AmmalgamFactory' as const,
    event: 'LendingTokensCreated' as const,
    block: { number: testBlockNumber(params.blockOffset ?? 0), timestamp: 1 },
    params: {
      pair: params.pair,
      depositL: params.depositL,
      depositX: params.depositX,
      depositY: params.depositY,
      borrowL: params.borrowL,
      borrowX: params.borrowX,
      borrowY: params.borrowY,
    },
  }
}

/** Same allowlist registration for AmmalgamPair; factory.ts's onEvent also creates Pool and both Tokens. */
export function pairCreatedRegistration(params: {
  pair: Address
  tokenX: Address
  tokenY: Address
  blockOffset?: number
}) {
  return {
    contract: 'AmmalgamFactory' as const,
    event: 'PairCreated' as const,
    block: { number: testBlockNumber(params.blockOffset ?? 0), timestamp: 1 },
    params: {
      tokenX: params.tokenX,
      tokenY: params.tokenY,
      pair: params.pair,
      allPairsLength: 1n,
    },
  }
}
