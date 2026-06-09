import { BigDecimal } from 'envio'

import { BORROW_L, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y } from './constants'

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

export function principalDelta(
  tokenType: number,
  assets: bigint,
  pool: { reserveX: bigint; reserveY: bigint; totalAssets: readonly bigint[] },
): bigint {
  const activeLiquidity = pool.totalAssets[DEPOSIT_L] - pool.totalAssets[BORROW_L]
  if (tokenType === DEPOSIT_X) return convertXToL(assets, pool.reserveX, activeLiquidity)
  if (tokenType === DEPOSIT_Y) return convertYToL(assets, pool.reserveY, activeLiquidity)
  return 0n
}
