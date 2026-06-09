import { describe, expect, it } from 'vitest'

import { ZERO_BD } from '../../src/utils/math'
import { createDefaultToken } from '../../src/utils/token'

describe('createDefaultToken', () => {
  it('builds the default token shape from metadata', () => {
    expect(
      createDefaultToken('11155111-0xabc', { symbol: 'TKX', name: 'Token X', decimals: 18 }),
    ).toEqual({
      id: '11155111-0xabc',
      symbol: 'TKX',
      name: 'Token X',
      decimals: 18,
      poolCount: 0,
      txCount: 0,
      volume: ZERO_BD,
      whitelistPoolIds: [],
    })
  })
})
