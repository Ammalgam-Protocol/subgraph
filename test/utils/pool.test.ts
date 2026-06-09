import { describe, expect, it } from 'vitest'

import { createDefaultPool } from '../../src/utils/pool'

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
