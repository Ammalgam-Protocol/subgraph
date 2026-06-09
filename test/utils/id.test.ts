import { describe, expect, it } from 'vitest'

import { getEventId, getPositionId, scopedId } from '../../src/utils/id'

describe('id utils', () => {
  it('scopedId prefixes the address with the chainId', () => {
    expect(scopedId(11155111, '0xabc')).toBe('11155111-0xabc')
  })

  it('getEventId returns chainId-txHash-logIndex', () => {
    expect(getEventId(11155111, '0xabc', 5)).toBe('11155111-0xabc-5')
  })

  it('getPositionId returns userId-poolId', () => {
    expect(getPositionId('0xuser', '0xpool')).toBe('0xuser-0xpool')
  })
})
