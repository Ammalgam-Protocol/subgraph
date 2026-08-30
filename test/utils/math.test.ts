import { BigDecimal } from 'envio'
import { describe, expect, it } from 'vitest'
import {
  convertTokenToDecimal,
  convertXToL,
  convertYToL,
  depletionAdjustedActiveLiquidity,
  exponentToBigDecimal,
  isqrt,
  mulDiv,
  mulDivCeil,
  ONE_BD,
  principalContribution,
  reserveAdjustment,
  safeDiv,
  splitLendingFee,
  toAssets,
  ZERO_BD,
} from '../../src/utils/math'

describe('math utils', () => {
  it('exposes ZERO_BD and ONE_BD constants', () => {
    expect(ZERO_BD.toString()).toBe('0')
    expect(ONE_BD.toString()).toBe('1')
  })

  it('exponentToBigDecimal builds 10^decimals', () => {
    expect(exponentToBigDecimal(0).toString()).toBe('1')
    expect(exponentToBigDecimal(3).toString()).toBe('1000')
  })

  it('safeDiv divides normally', () => {
    expect(safeDiv(new BigDecimal('10'), new BigDecimal('2')).toString()).toBe('5')
  })

  it('safeDiv returns 0 when denominator is 0', () => {
    expect(safeDiv(new BigDecimal('10'), new BigDecimal('0')).toString()).toBe('0')
  })

  it('convertTokenToDecimal with 0 decimals returns the raw amount', () => {
    expect(convertTokenToDecimal(12345n, 0).toString()).toBe('12345')
  })

  it('convertTokenToDecimal scales by 10^decimals', () => {
    expect(convertTokenToDecimal(1000000n, 6).toString()).toBe('1')
  })

  it('convertXToL calculates correctly', () => {
    // amountX * activeLiquidity / reserveX
    expect(convertXToL(100n, 1000n, 500n)).toBe(50n)
  })

  it('convertXToL returns 0 when reserveX is 0', () => {
    expect(convertXToL(100n, 0n, 500n)).toBe(0n)
  })

  it('convertYToL calculates correctly', () => {
    expect(convertYToL(200n, 1000n, 500n)).toBe(100n)
  })

  it('convertYToL returns 0 when reserveY is 0', () => {
    expect(convertYToL(200n, 0n, 500n)).toBe(0n)
  })
})

describe('mulDiv', () => {
  it('floors', () => expect(mulDiv(7n, 3n, 2n)).toBe(10n))
  it('returns 0 on zero denominator', () => expect(mulDiv(7n, 3n, 0n)).toBe(0n))
})

describe('mulDivCeil', () => {
  it('rounds up on a remainder', () => expect(mulDivCeil(7n, 3n, 2n)).toBe(11n))
  it('leaves an exact quotient alone', () => expect(mulDivCeil(7n, 3n, 3n)).toBe(7n))
  it('returns 0 for a zero product', () => expect(mulDivCeil(0n, 3n, 2n)).toBe(0n))
  it('returns 0 on zero denominator', () => expect(mulDivCeil(7n, 3n, 0n)).toBe(0n))
})

describe('toAssets', () => {
  it('returns shares 1:1 when totalShares is 0', () => expect(toAssets(5n, 100n, 0n)).toBe(5n))
  it('converts by rate with floor', () => expect(toAssets(3n, 10n, 4n)).toBe(7n))
})

describe('isqrt', () => {
  it('handles 0 and 1', () => {
    expect(isqrt(0n)).toBe(0n)
    expect(isqrt(1n)).toBe(1n)
  })
  it('perfect square', () => expect(isqrt(144n)).toBe(12n))
  it('floors non-square', () => expect(isqrt(145n)).toBe(12n))
  it('large values', () => expect(isqrt(10n ** 36n)).toBe(10n ** 18n))
  it('throws on negative', () => expect(() => isqrt(-1n)).toThrow())
})

describe('reserveAdjustment', () => {
  // Mirrors Convert.calculateReserveAdjustmentsForMissingAssets, BUFFER=19/BUFFER_NUMERATOR=20.
  it('not depleted: reserve*19 >= missing*20 returns reserve', () =>
    expect(reserveAdjustment(2000n, 100n)).toBe(2000n))
  it('depleted: reserve*19 < missing*20 returns (reserve-missing)*20', () =>
    expect(reserveAdjustment(100n, 96n)).toBe(80n))
  it('threshold boundary: reserve*19 == missing*20 is NOT depleted', () =>
    expect(reserveAdjustment(20n, 19n)).toBe(20n))
})

describe('depletionAdjustedActiveLiquidity', () => {
  it('sqrt(rX*rY) when nothing is missing', () =>
    expect(depletionAdjustedActiveLiquidity(400n, 900n, 0n, 0n)).toBe(600n))
  it('adjusts the depleted side', () =>
    // adjust(100,96)=80, adjust(900,0)=900 -> isqrt(72000)=268
    expect(depletionAdjustedActiveLiquidity(100n, 900n, 96n, 0n)).toBe(268n))
})

describe('principalContribution', () => {
  const pool = {
    reserveX: 1000n,
    reserveY: 2000n,
    totalAssets: [1500n, 0n, 0n, 500n, 0n, 0n] as const, // activeLiquidity = 1500-500 = 1000
  }
  it('DEPOSIT_L: +assets', () => expect(principalContribution(0, 70n, pool)).toBe(70n))
  it('DEPOSIT_X: convertXToL', () => expect(principalContribution(1, 100n, pool)).toBe(100n))
  it('DEPOSIT_Y: convertYToL', () => expect(principalContribution(2, 100n, pool)).toBe(50n))
  it('BORROW_L: -assets', () => expect(principalContribution(3, 70n, pool)).toBe(-70n))
  it('BORROW_X is 0 (preserved quirk)', () => expect(principalContribution(4, 100n, pool)).toBe(0n))
  it('BORROW_Y is 0 (preserved quirk)', () => expect(principalContribution(5, 100n, pool)).toBe(0n))
  it('DEPOSIT_X with zero reserve returns 0', () =>
    expect(principalContribution(1, 100n, { ...pool, reserveX: 0n })).toBe(0n))
})

describe('splitLendingFee', () => {
  it('recovers principal and fee from a post-fee amount', () => {
    expect(splitLendingFee(100050n)).toEqual({ principal: 100000n, lendingFee: 50n })
  })

  it('rounds the fee up on non-exact multiples', () => {
    // principal 99: ceil(99 * 5 / 10000) = 1, so amount 100 splits as 99 + 1.
    expect(splitLendingFee(100n)).toEqual({ principal: 99n, lendingFee: 1n })
    expect(splitLendingFee(2n)).toEqual({ principal: 1n, lendingFee: 1n })
  })

  it('handles zero', () => {
    expect(splitLendingFee(0n)).toEqual({ principal: 0n, lendingFee: 0n })
  })

  it('returns undefined when no integer principal solves the equation', () => {
    // amount 1 is unreachable: principal 0 gives 0, principal 1 gives 2.
    expect(splitLendingFee(1n)).toBeUndefined()
  })
})
