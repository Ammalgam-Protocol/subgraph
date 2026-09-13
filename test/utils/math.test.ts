import { BigDecimal } from 'envio'
import { describe, expect, it } from 'vitest'
import {
  calculateDepositLiquidityAssets,
  calculateSwapFeeReserve,
  convertLToX,
  convertLToY,
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
  splitSwapFee,
  swapFeeGrowth,
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
  it('protocol interest rate (LENDING_FEE_RATE=10 of 100) at 0, 1 wei and uint112 max', () => {
    expect(mulDivCeil(0n, 10n, 100n)).toBe(0n)
    expect(mulDivCeil(1n, 10n, 100n)).toBe(1n)
    const uint112Max = 2n ** 112n - 1n
    expect(mulDivCeil(uint112Max, 10n, 100n)).toBe(519229685853482762853049632922010n)
  })
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

describe('convertLToX', () => {
  it('converts L to X at the reserve ratio', () => expect(convertLToX(100n, 500n, 200n)).toBe(250n))
  it('returns 0 when activeLiquidity is 0', () => expect(convertLToX(100n, 500n, 0n)).toBe(0n))
})

describe('convertLToY', () => {
  it('converts L to Y at the reserve ratio', () => expect(convertLToY(100n, 500n, 200n)).toBe(250n))
  it('returns 0 when activeLiquidity is 0', () => expect(convertLToY(100n, 500n, 0n)).toBe(0n))
})

describe('calculateSwapFeeReserve', () => {
  it('at the 95% boundary exactly (reserve*19 == missing*20) returns the full reserve', () =>
    expect(calculateSwapFeeReserve(100n, 95n)).toBe(100n))
  it('just past the 95% boundary returns reserve - missing', () =>
    expect(calculateSwapFeeReserve(100n, 96n)).toBe(4n))
  it('mirrors the boundary on the other leg', () => {
    expect(calculateSwapFeeReserve(2000n, 1900n)).toBe(2000n)
    expect(calculateSwapFeeReserve(2000n, 1901n)).toBe(99n)
  })
})

describe('swapFeeGrowth', () => {
  it('single-sided: only X moves', () =>
    // isqrt(1000*1000)=1000, isqrt(1010*1000)=1004
    expect(swapFeeGrowth(1000n, 1000n, 1010n, 1000n, 0n, 0n)).toBe(4n))

  it('clamps to 0 when active liquidity would fall (defensive, never observed in practice)', () =>
    expect(swapFeeGrowth(1000n, 1000n, 900n, 900n, 0n, 0n)).toBe(0n))

  it('two-sided: both X and Y move', () =>
    // isqrt(1000*1000)=1000, isqrt(1010*1005)=1007
    expect(swapFeeGrowth(1000n, 1000n, 1010n, 1005n, 0n, 0n)).toBe(7n))

  it('exact-paid: growth values within 1e-5 of the constant-product required fee', () => {
    // 1,000,000e18 reserves, 10,000e18 X in, 20e18 required fee kept in reserves; y-out solved
    // from the fee-adjusted input so K holds with equality.
    const reserve = 10n ** 24n
    const amountIn = 10_000n * 10n ** 18n
    const requiredFee = 20n * 10n ** 18n
    const amountInAfterFee = amountIn - requiredFee
    const out = (reserve * amountInAfterFee) / (reserve + amountInAfterFee)
    const postX = reserve + amountIn
    const postY = reserve - out

    const growth = swapFeeGrowth(reserve, reserve, postX, postY, 0n, 0n)
    const activeLiquidity = depletionAdjustedActiveLiquidity(postX, postY, 0n, 0n)
    const valuedInX = (2n * growth * calculateSwapFeeReserve(postX, 0n)) / activeLiquidity

    const ratio = Number(valuedInX) / Number(requiredFee)
    expect(Math.abs(ratio - 1)).toBeLessThan(1e-5)
  })

  it('with router slack: overpaying for the same output values the whole overpayment', () => {
    // Router quotes 10,000e18 X for a fixed out at the pre-swap price, then pays 0.5% more (stale
    // slippage tolerance) for that same out; the extra 50e18 lands entirely in growth on top of the quoted fee.
    const reserve = 10n ** 24n
    const amountIn = 10_000n * 10n ** 18n
    const requiredFee = 20n * 10n ** 18n
    const amountInAfterFee = amountIn - requiredFee
    const out = (reserve * amountInAfterFee) / (reserve + amountInAfterFee)
    const slackAmountIn = (amountIn * 1005n) / 1000n
    const postX = reserve + slackAmountIn
    const postY = reserve - out

    const growth = swapFeeGrowth(reserve, reserve, postX, postY, 0n, 0n)
    const activeLiquidity = depletionAdjustedActiveLiquidity(postX, postY, 0n, 0n)
    const valuedInX = (2n * growth * calculateSwapFeeReserve(postX, 0n)) / activeLiquidity

    expect(valuedInX).toBe(70001212853274820426n)
    expect(valuedInX).toBeGreaterThan(3n * requiredFee)
  })

  it('depleted pre-state where the raw (unadjusted) growth would be negative', () => {
    // Depletion fixture: X 96% depleted, 1000 X in. The unadjusted isqrt(postX*postY) - isqrt(preX*preY)
    // is negative; the depletion-adjusted growth below stays positive, matching the contract's K basis.
    const reserve = 10n ** 24n
    const missingX = (96n * 10n ** 24n) / 100n
    const amountIn = 10n ** 21n
    const postX = reserve + amountIn
    const postY = 975681147401029343610509n

    const rawGrowth = isqrt(postX * postY) - isqrt(reserve * reserve)
    expect(rawGrowth).toBeLessThan(0n)

    const growth = swapFeeGrowth(reserve, reserve, postX, postY, missingX, 0n)
    expect(growth).toBe(32724741893124811477n)
  })
})

describe('swapFeeGrowth valuation in a depleted pre-state', () => {
  it('reproduces 3.00005 X against a 3 X fee, not the 73.245 X raw-reserve valuation', () => {
    const reserve = 10n ** 24n
    const missingX = (96n * 10n ** 24n) / 100n
    const amountIn = 10n ** 21n
    const postX = reserve + amountIn
    const postY = 975681147401029343610509n

    const growth = swapFeeGrowth(reserve, reserve, postX, postY, missingX, 0n)
    const activeLiquidity = depletionAdjustedActiveLiquidity(postX, postY, missingX, 0n)

    const correctValuation =
      (2n * growth * calculateSwapFeeReserve(postX, missingX)) / activeLiquidity
    expect(correctValuation).toBe(3000054880056605801n)

    const rawReserveValuation = (2n * growth * postX) / activeLiquidity
    expect(rawReserveValuation).toBe(73245242315528351399n)
    expect(rawReserveValuation).not.toBe(correctValuation)
  })
})

describe('calculateDepositLiquidityAssets', () => {
  it('fee-less deposit stays in the depleted branch', () => {
    // missingX = 99 - 2 = 97; 100*19=1900 < 97*20=1940 -> depleted: adjust(100,97)=60.
    // depositL = isqrt(60*100) + borrowL(10) = 77 + 10.
    expect(calculateDepositLiquidityAssets(100n, 100n, 2n, 100n, 10n, 99n, 50n)).toBe(87n)
  })

  it('deposits covering both sides leave missing at 0 on both legs', () => {
    // borrowX(80) <= depositX(100) -> missingX=0; borrowY(90) > depositY(50) -> missingY=40.
    // Neither leg is depleted at these reserves: isqrt(1000*1000) + borrowL(5) = 1005.
    expect(calculateDepositLiquidityAssets(1000n, 1000n, 100n, 50n, 5n, 80n, 90n)).toBe(1005n)
  })

  it('fee-inclusive deposit crosses out of the depleted branch', () => {
    // missingX = 99 - 7 = 92; 100*19=1900 >= 92*20=1840 -> not depleted: adjust(100,92)=100.
    // depositL = isqrt(100*100) + borrowL(10) = 100 + 10.
    expect(calculateDepositLiquidityAssets(100n, 100n, 7n, 100n, 10n, 99n, 50n)).toBe(110n)
  })
})

describe('splitSwapFee', () => {
  it('returns 0/0 when there is no growth', () => {
    expect(splitSwapFee(0n, 10n, 10n, 1000n, 1000n, 0n, 0n, 1000n)).toEqual({
      feeAmountX: 0n,
      feeAmountY: 0n,
    })
  })

  it('one-sided: all growth values into the input token', () => {
    expect(splitSwapFee(15n, 10n, 0n, 1000n, 1000n, 0n, 0n, 500n)).toEqual({
      feeAmountX: 60n,
      feeAmountY: 0n,
    })
    expect(splitSwapFee(15n, 0n, 10n, 1000n, 1000n, 0n, 0n, 500n)).toEqual({
      feeAmountX: 0n,
      feeAmountY: 60n,
    })
  })

  it('balanced inputs at an even price split the growth evenly', () => {
    expect(splitSwapFee(20n, 10n, 10n, 1000n, 1000n, 0n, 0n, 1000n)).toEqual({
      feeAmountX: 20n,
      feeAmountY: 20n,
    })
  })

  it('one depleted leg weighs that leg 20x, an ~95/5 split of the growth', () => {
    // X depleted (1000*19=19000 < 960*20=19200): weightX=10*20=200, weightY=10.
    // Cross at the post-swap price (postY=postX=1000): 200:10 = 20:1 -> feeL 200:10 of 210.
    const result = splitSwapFee(210n, 10n, 10n, 1000n, 1000n, 960n, 0n, 100n)
    expect(result).toEqual({ feeAmountX: 160n, feeAmountY: 200n })
  })

  it('the other depleted leg mirrors the weighting (Y depleted this time)', () => {
    const result = splitSwapFee(210n, 10n, 10n, 1000n, 1000n, 0n, 960n, 100n)
    expect(result).toEqual({ feeAmountX: 200n, feeAmountY: 160n })
  })

  it('zero post-swap reserves on both legs (degenerate) fall back to a zero split', () => {
    const result = splitSwapFee(100n, 5n, 5n, 0n, 0n, 0n, 0n, 50n)
    expect(result).toEqual({ feeAmountX: 0n, feeAmountY: 0n })
  })
})
