import { describe, expect, it } from 'vitest'

import { getChainConfig } from '../../src/utils/chains'

describe('chains utils', () => {
  it('getChainConfig returns Sepolia config', () => {
    const config = getChainConfig(11155111)
    expect(config.nativeTokenDetails.symbol).toBe('ETH')
    expect(config.stablecoinAddresses.length).toBeGreaterThan(0)
  })

  it('getChainConfig throws for an unsupported chain', () => {
    expect(() => getChainConfig(1)).toThrow('Unsupported chain: 1')
  })
})
