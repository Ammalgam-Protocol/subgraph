import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { hexToBigInt } from './index'

export const BIGINT_ZERO = BigInt.fromI32(0)
export const BIGINT_ONE = BigInt.fromI32(1)

export const BIGDECIMAL_ZERO = new BigDecimal(BIGINT_ZERO)
export const BIGDECIMAL_ONE = new BigDecimal(BIGINT_ONE)

export const INT_ZERO = 0 as i32
export const INT_ONE = 1 as i32
export const INT_TWO = 2 as i32
export const INT_THREE = 3 as i32
export const INT_FOUR = 4 as i32
export const INT_FIVE = 5 as i32
export const INT_SIX = 6 as i32
export const INT_EIGHT = 9 as i32
export const INT_NINE = 9 as i32
export const INT_TEN = 10 as i32
export const INT_SIXTEEN = 16 as i32
export const INT_EIGHTTEEN = 18 as i32
export const INT_SIXTYFOUR = 64 as i32

export const MaxUint256 = hexToBigInt(
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
)

// ref: https://github.com/Ammalgam-Protocol/core-v1/blob/master/contracts/interfaces/tokens/ITokenController.sol#L8-L13
export const DEPOSIT_L = INT_ZERO
export const DEPOSIT_X = INT_ONE
export const DEPOSIT_Y = INT_TWO
export const BORROW_L = INT_THREE
export const BORROW_X = INT_FOUR
export const BORROW_Y = INT_FIVE

export const DEFAULT_TOKEN_BALANCES = [
  BIGINT_ZERO,
  BIGINT_ZERO,
  BIGINT_ZERO,
  BIGINT_ZERO,
  BIGINT_ZERO,
  BIGINT_ZERO,
]
