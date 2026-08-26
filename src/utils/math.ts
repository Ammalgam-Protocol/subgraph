import { BigDecimal } from 'envio'

import {
  BIPS,
  BORROW_L,
  DEPOSIT_L,
  DEPOSIT_X,
  DEPOSIT_Y,
  INITIAL_LENDING_FEE_BIPS,
} from './constants'

export const ZERO_BD = new BigDecimal(0)
export const ONE_BD = new BigDecimal(1)
const TEN = new BigDecimal(10)

export function exponentToBigDecimal(decimals: number): BigDecimal {
  let result = ONE_BD
  for (let i = 0; i < decimals; i++) {
    result = result.times(TEN)
  }
  return result
}

export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.isEqualTo(ZERO_BD)) {
    return ZERO_BD
  }
  return amount0.div(amount1)
}

export function convertTokenToDecimal(tokenAmount: bigint, exchangeDecimals: number): BigDecimal {
  if (exchangeDecimals === 0) {
    return new BigDecimal(tokenAmount.toString())
  }
  return new BigDecimal(tokenAmount.toString()).div(exponentToBigDecimal(exchangeDecimals))
}

export function convertXToL(amountX: bigint, reserveX: bigint, activeLiquidity: bigint): bigint {
  if (reserveX === 0n) return 0n
  return (amountX * activeLiquidity) / reserveX
}

export function convertYToL(amountY: bigint, reserveY: bigint, activeLiquidity: bigint): bigint {
  if (reserveY === 0n) return 0n
  return (amountY * activeLiquidity) / reserveY
}

export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n
  return (a * b) / denominator
}

export function mulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n
  return (a * b + denominator - 1n) / denominator
}

// ERC4626 share->asset conversion, floor (Convert.toAssets with !ROUNDING_UP).
export function toAssets(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  if (totalShares === 0n) return shares
  return mulDiv(shares, totalAssets, totalShares)
}

// Floor integer sqrt via Newton's method, matching Solidity Math.sqrt.
export function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error('isqrt of negative value')
  if (value < 2n) return value
  let x0 = value / 2n
  let x1 = (x0 + value / x0) / 2n
  while (x1 < x0) {
    x0 = x1
    x1 = (x0 + value / x0) / 2n
  }
  return x0
}

// Convert.calculateReserveAdjustmentsForMissingAssets with BUFFER=19, BUFFER_NUMERATOR=20.
export function reserveAdjustment(reserve: bigint, missing: bigint): bigint {
  return reserve * 19n < missing * 20n ? (reserve - missing) * 20n : reserve
}

export function depletionAdjustedActiveLiquidity(
  reserveX: bigint,
  reserveY: bigint,
  missingX: bigint,
  missingY: bigint,
): bigint {
  return isqrt(reserveAdjustment(reserveX, missingX) * reserveAdjustment(reserveY, missingY))
}

// Signed L-denominated principal contribution of an asset delta.
export function principalContribution(
  tokenType: number,
  assets: bigint,
  pool: { reserveX: bigint; reserveY: bigint; totalAssets: readonly bigint[] },
): bigint {
  if (tokenType === DEPOSIT_L) return assets
  if (tokenType === BORROW_L) return -assets
  const activeLiquidity = pool.totalAssets[DEPOSIT_L] - pool.totalAssets[BORROW_L]
  if (tokenType === DEPOSIT_X) return convertXToL(assets, pool.reserveX, activeLiquidity)
  if (tokenType === DEPOSIT_Y) return convertYToL(assets, pool.reserveY, activeLiquidity)
  return 0n
}

// Borrow events store post-fee assets, so principal must be recovered by inversion.
// Returns undefined (never a nearest fit) when no integer solves the equation.
export function splitLendingFee(
  amount: bigint,
): { principal: bigint; lendingFee: bigint } | undefined {
  const principal = (amount * BIPS) / (BIPS + INITIAL_LENDING_FEE_BIPS)
  const lendingFee = mulDivCeil(principal, INITIAL_LENDING_FEE_BIPS, BIPS)
  return principal + lendingFee === amount ? { principal, lendingFee } : undefined
}
