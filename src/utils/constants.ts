export const ZERO_BI = 0n

export const DEPOSIT_L = 0
export const DEPOSIT_X = 1
export const DEPOSIT_Y = 2
export const BORROW_L = 3
export const BORROW_X = 4
export const BORROW_Y = 5

export const DEFAULT_TOKEN_BALANCES: bigint[] = [0n, 0n, 0n, 0n, 0n, 0n]

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

// A compile-time constant in core-v1, not governance-settable, so hardcoding is safe; ref:
// github.com/Ammalgam-Protocol/core-v1/blob/master/contracts/libraries/constants.sol
export const INITIAL_LENDING_FEE_BIPS = 5n

export const BIPS = 10000n
