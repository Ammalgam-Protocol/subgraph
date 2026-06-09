import { BigDecimal } from 'envio'
import { describe, expect, it } from 'vitest'

import {
  convertTokenToDecimal,
  convertXToL,
  convertYToL,
  exponentToBigDecimal,
  ONE_BD,
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
