import { describe, expect, it } from 'vitest'

import { createDefaultPosition } from '../../src/utils/position'

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
  })
})
