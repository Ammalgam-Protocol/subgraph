import { describe, expect, it } from 'vitest'

import { addAt, updateAt } from '../../src/utils/array'

describe('array utils', () => {
  const base = [0n, 100n, 200n, 300n, 400n, 500n]

  it('updateAt replaces value at index', () => {
    expect(updateAt(base, 999n, 2)).toEqual([0n, 100n, 999n, 300n, 400n, 500n])
  })

  it('updateAt returns copy for out-of-bounds', () => {
    const result = updateAt(base, 999n, 10)
    expect(result).toEqual(base)
    expect(result).not.toBe(base) // must be a copy
  })

  it('addAt adds value at index', () => {
    expect(addAt(base, 50n, 1)).toEqual([0n, 150n, 200n, 300n, 400n, 500n])
  })

  it('updateAt returns copy for negative index', () => {
    const result = updateAt(base, 999n, -1)
    expect(result).toEqual(base)
    expect(result).not.toBe(base)
  })

  it('addAt treats out-of-bounds index as no-op copy', () => {
    expect(addAt(base, 50n, 10)).toEqual(base)
  })
})
