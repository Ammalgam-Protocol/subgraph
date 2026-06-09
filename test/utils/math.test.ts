import { BigDecimal } from 'envio'
import { describe, expect, it } from 'vitest'
import { BORROW_X, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y } from '../../src/utils/constants'
import {
  convertTokenToDecimal,
  convertXToL,
  convertYToL,
  exponentToBigDecimal,
  ONE_BD,
  principalDelta,
  safeDiv,
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

describe('principalDelta', () => {
  // totalAssets indexed by tokenType; activeLiquidity = totalAssets[DEPOSIT_L] - totalAssets[BORROW_L]
  const pool = { reserveX: 1000n, reserveY: 2000n, totalAssets: [500n, 0n, 0n, 100n, 0n, 0n] }

  it('converts DEPOSIT_X via reserveX', () => {
    // convertXToL(100, 1000, 400) = 100 * 400 / 1000 = 40
    expect(principalDelta(DEPOSIT_X, 100n, pool)).toBe(40n)
  })
  it('converts DEPOSIT_Y via reserveY', () => {
    // convertYToL(100, 2000, 400) = 100 * 400 / 2000 = 20
    expect(principalDelta(DEPOSIT_Y, 100n, pool)).toBe(20n)
  })
  it('returns 0n for non-deposit-X/Y token types (incl. BORROW_X and DEPOSIT_L)', () => {
    expect(principalDelta(BORROW_X, 100n, pool)).toBe(0n)
    expect(principalDelta(DEPOSIT_L, 100n, pool)).toBe(0n)
  })
})
