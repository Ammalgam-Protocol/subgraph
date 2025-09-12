import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import { LendingToken, Pool } from '../types/schema'

import { BIGDECIMAL_ZERO, BIGINT_ZERO, DEFAULT_TOKEN_BALANCES, INT_ZERO } from './constants'
import { NativeTokenDetails } from './nativeTokenDetails'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol } from './token'

// @dev: Cannot save `Pool` without setting `tokenX` and `tokenY`
export function createPool(poolAddress: Address): Pool {
  const pool = new Pool(poolAddress.toHexString())
  pool.reserveX = BIGINT_ZERO
  pool.reserveY = BIGINT_ZERO
  pool.tokenXPrice = BIGDECIMAL_ZERO
  pool.tokenYPrice = BIGDECIMAL_ZERO
  pool.totalAssets = DEFAULT_TOKEN_BALANCES
  pool.totalShares = DEFAULT_TOKEN_BALANCES

  // Quantitative values
  pool.borrowCount = INT_ZERO
  pool.depositCount = INT_ZERO
  pool.repayCount = INT_ZERO
  pool.positionCount = INT_ZERO
  pool.swapCount = INT_ZERO
  pool.syncCount = INT_ZERO
  pool.transferCount = INT_ZERO
  pool.txCount = INT_ZERO
  pool.withdrawCount = INT_ZERO
  pool.volumeTokenX = BIGDECIMAL_ZERO
  pool.volumeTokenY = BIGDECIMAL_ZERO

  return pool
}

export function createLendingToken(
  poolAddress: Address,
  lendingTokenAddress: Address,
  tokenType: i32,
  nativeTokenDetails: NativeTokenDetails,
): LendingToken {
  const lendingToken = new LendingToken(lendingTokenAddress.toHexString())
  lendingToken.symbol = fetchTokenSymbol(lendingTokenAddress, [], nativeTokenDetails)
  lendingToken.name = fetchTokenName(lendingTokenAddress, [], nativeTokenDetails)
  const decimals = fetchTokenDecimals(lendingTokenAddress, [], nativeTokenDetails)

  if (decimals === INT_ZERO) {
    log.critical('Invalid decimals on lendingToken: {}', [lendingTokenAddress.toHexString()])
  }

  lendingToken.decimals = decimals
  lendingToken.pool = poolAddress.toHexString()
  lendingToken.tokenType = tokenType
  lendingToken.save()

  return lendingToken
}

export function convertXToL(amountX: BigInt, reserveX: BigInt, activeLiquidity: BigInt): BigInt {
  return amountX.times(activeLiquidity).div(reserveX)
}

export function convertYToL(amountY: BigInt, reserveY: BigInt, activeLiquidity: BigInt): BigInt {
  return amountY.times(activeLiquidity).div(reserveY)
}
