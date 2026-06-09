import { describe, expect, it } from 'vitest'

import { createDefaultUser } from '../../src/utils/user'

describe('user utils', () => {
  it('createDefaultUser initializes a zeroed user', () => {
    expect(createDefaultUser('0xuser')).toEqual({
      id: '0xuser',
      positionCount: 0,
      swapCount: 0,
      liquidationCount: 0,
      depositCount: 0,
      withdrawCount: 0,
      borrowCount: 0,
      repayCount: 0,
      transferredCount: 0,
      receivedCount: 0,
    })
  })
})
