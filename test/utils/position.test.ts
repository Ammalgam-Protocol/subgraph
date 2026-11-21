import { describe, expect, it } from 'vitest'

import {
  addPendingFields,
  clearPendingFields,
  createDefaultPosition,
  getLendingTokenIndex,
  getPendingFields,
} from '../../src/utils/position'

describe('position utils', () => {
  it('createDefaultPosition initializes a zeroed position with derived id', () => {
    const position = createDefaultPosition('0xuser', '0xpool', '0xhash', 5n, 6n)
    expect(position.id).toBe('0xuser-0xpool')
    expect(position.user_id).toBe('0xuser')
    expect(position.pool_id).toBe('0xpool')
    expect(position.hash).toBe('0xhash')
    expect(position.blockNumber).toBe(5n)
    expect(position.timestamp).toBe(6n)
    expect(position.assets).toEqual([0n, 0n, 0n, 0n, 0n, 0n])
    expect(position.shares).toEqual([0n, 0n, 0n, 0n, 0n, 0n])
    expect(position.principal).toBe(0n)
    expect(position.depositCount).toBe(0)
    expect(position.withdrawCount).toBe(0)
    expect(position.borrowCount).toBe(0)
    expect(position.repayCount).toBe(0)
    expect(position.transferredCount).toBe(0)
    expect(position.receivedCount).toBe(0)
    expect(position.pendingTxHash).toBeUndefined()
    expect(position.pendingSeizedAssets).toBeUndefined()
    expect(position.pendingRepaidAssets).toBeUndefined()
    expect(position.pendingBadDebtAssets).toBeUndefined()
  })

  it('getLendingTokenIndex maps deposit and borrow token types onto [L, X, Y]', () => {
    expect([0, 1, 2, 3, 4, 5].map(getLendingTokenIndex)).toEqual([0, 1, 2, 0, 1, 2])
  })

  describe('pending stash', () => {
    const base = createDefaultPosition('0xuser', '0xpool', '0xhash', 5n, 6n)

    it('addPendingFields starts a transaction at zeros and adds at the index', () => {
      const next = addPendingFields(base, '0xtx1', 'pendingSeizedAssets', 1, 40n)
      expect(next.pendingTxHash).toBe('0xtx1')
      expect(next.pendingSeizedAssets).toEqual([0n, 40n, 0n])
      expect(next.pendingRepaidAssets).toEqual([0n, 0n, 0n])
      expect(next.pendingBadDebtAssets).toEqual([0n, 0n, 0n])
    })

    it('addPendingFields accumulates within one transaction', () => {
      const once = addPendingFields(base, '0xtx1', 'pendingSeizedAssets', 1, 40n)
      const twice = addPendingFields(once, '0xtx1', 'pendingSeizedAssets', 1, 2n)
      const other = addPendingFields(twice, '0xtx1', 'pendingRepaidAssets', 0, 9n)
      expect(other.pendingSeizedAssets).toEqual([0n, 42n, 0n])
      expect(other.pendingRepaidAssets).toEqual([9n, 0n, 0n])
    })

    it('addPendingFields resets every array when the transaction hash changes', () => {
      const old = addPendingFields(
        addPendingFields(base, '0xtx1', 'pendingSeizedAssets', 1, 40n),
        '0xtx1',
        'pendingBadDebtAssets',
        2,
        5n,
      )
      const next = addPendingFields(old, '0xtx2', 'pendingRepaidAssets', 0, 3n)
      expect(next.pendingTxHash).toBe('0xtx2')
      expect(next.pendingSeizedAssets).toEqual([0n, 0n, 0n])
      expect(next.pendingBadDebtAssets).toEqual([0n, 0n, 0n])
      expect(next.pendingRepaidAssets).toEqual([3n, 0n, 0n])
    })

    it('addPendingFields treats missing arrays under the same hash as zeros', () => {
      const next = addPendingFields(
        { ...base, pendingTxHash: '0xtx1' },
        '0xtx1',
        'pendingRepaidAssets',
        2,
        6n,
      )
      expect(next.pendingRepaidAssets).toEqual([0n, 0n, 6n])
      expect(next.pendingSeizedAssets).toEqual([0n, 0n, 0n])
    })

    it('addPendingFields floors a negative adjustment at zero', () => {
      const once = addPendingFields(base, '0xtx1', 'pendingRepaidAssets', 1, 4n)
      expect(
        addPendingFields(once, '0xtx1', 'pendingRepaidAssets', 1, -9n).pendingRepaidAssets,
      ).toEqual([0n, 0n, 0n])
    })

    it('getPendingFields returns the stash for the same transaction and zeros otherwise', () => {
      const stashed = addPendingFields(base, '0xtx1', 'pendingSeizedAssets', 0, 8n)
      expect(getPendingFields(stashed, '0xtx1').seized).toEqual([8n, 0n, 0n])
      expect(getPendingFields(stashed, '0xtx2')).toEqual({
        seized: [0n, 0n, 0n],
        repaid: [0n, 0n, 0n],
        badDebt: [0n, 0n, 0n],
      })
      expect(getPendingFields(base, '0xtx1').repaid).toEqual([0n, 0n, 0n])
      expect(getPendingFields(undefined, '0xtx1').seized).toEqual([0n, 0n, 0n])
      expect(
        getPendingFields({ ...stashed, pendingSeizedAssets: undefined }, '0xtx1').seized,
      ).toEqual([0n, 0n, 0n])
    })

    it('clearPendingFields zeroes the arrays and keeps the hash', () => {
      const stashed = addPendingFields(base, '0xtx1', 'pendingSeizedAssets', 0, 8n)
      const cleared = clearPendingFields(stashed)
      expect(cleared.pendingTxHash).toBe('0xtx1')
      expect(cleared.pendingSeizedAssets).toEqual([0n, 0n, 0n])
      expect(cleared.pendingRepaidAssets).toEqual([0n, 0n, 0n])
      expect(cleared.pendingBadDebtAssets).toEqual([0n, 0n, 0n])
    })
  })
})
