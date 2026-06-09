import { BigDecimal } from 'envio'
import { describe, expect, it } from 'vitest'

import { createDefaultPool, poolPriceFields } from '../../src/utils/pool'

describe('pool utils', () => {
  it('createDefaultPool initializes a zeroed pool', () => {
    const pool = createDefaultPool('0xpool', '0xX', '0xY', 'X-Y', 10n, 20n)
    expect(pool.id).toBe('0xpool')
    expect(pool.tokenX_id).toBe('0xX')
    expect(pool.tokenY_id).toBe('0xY')
    expect(pool.name).toBe('X-Y')
    expect(pool.createdAtTimestamp).toBe(10n)
    expect(pool.createdAtBlockNumber).toBe(20n)
    expect(pool.totalAssets).toEqual([0n, 0n, 0n, 0n, 0n, 0n])
    expect(pool.totalShares).toEqual([0n, 0n, 0n, 0n, 0n, 0n])
    expect(pool.txCount).toBe(0)
    expect(pool.depositCount).toBe(0)
    expect(pool.withdrawCount).toBe(0)
    expect(pool.borrowCount).toBe(0)
    expect(pool.repayCount).toBe(0)
    expect(pool.transferCount).toBe(0)
    expect(pool.swapCount).toBe(0)
    expect(pool.syncCount).toBe(0)
    expect(pool.positionCount).toBe(0)
    expect(pool.reserveX).toBe(0n)
    expect(pool.reserveY).toBe(0n)
    expect(pool.tokenXPrice.toString()).toBe('0')
    expect(pool.tokenYPrice.toString()).toBe('0')
    expect(pool.volumeTokenX.toString()).toBe('0')
    expect(pool.volumeTokenY.toString()).toBe('0')
  })
})

describe('poolPriceFields', () => {
  it('stores raw reserves and computes decimal-normalized prices', () => {
    const r = poolPriceFields(
      { decimals: 18 },
      { decimals: 18 },
      1000n * 10n ** 18n,
      2000n * 10n ** 18n,
    )
    expect(r.reserveX).toBe(1000n * 10n ** 18n)
    expect(r.reserveY).toBe(2000n * 10n ** 18n)
    expect(r.tokenXPrice.isEqualTo(new BigDecimal('0.5'))).toBe(true)
    expect(r.tokenYPrice.isEqualTo(new BigDecimal('2'))).toBe(true)
  })
  it('returns zero prices when a reserve is zero (safeDiv guard)', () => {
    const r = poolPriceFields({ decimals: 18 }, { decimals: 18 }, 1000n * 10n ** 18n, 0n)
    expect(r.tokenXPrice.isEqualTo(new BigDecimal(0))).toBe(true)
    expect(r.tokenYPrice.isEqualTo(new BigDecimal(0))).toBe(true)
  })
})
