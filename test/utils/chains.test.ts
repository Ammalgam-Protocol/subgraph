import { describe, expect, it } from 'vitest'
import { getChainConfig, isWhitelisted, shouldSkipPool } from '../../src/utils/chains'

describe('chains utils', () => {
  it('getChainConfig returns Sepolia config', () => {
    const config = getChainConfig(11155111)
    expect(config.nativeTokenDetails.symbol).toBe('ETH')
    expect(config.stablecoinAddresses.length).toBeGreaterThan(0)
  })

  it('getChainConfig returns Mainnet config', () => {
    const config = getChainConfig(1)
    expect(config.nativeTokenDetails.symbol).toBe('ETH')
    expect(config.stablecoinAddresses.length).toBeGreaterThan(0)
  })

  it('getChainConfig throws for an unsupported chain', () => {
    expect(() => getChainConfig(999999)).toThrow('Unsupported chain: 999999')
  })
})

const CHAIN = 11155111
const WETH = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14'
const RANDOM = '0x1111111111111111111111111111111111111111'

describe('chain lookups', () => {
  it('isWhitelisted matches whitelist tokens', () => {
    expect(isWhitelisted(CHAIN, WETH)).toBe(true)
    expect(isWhitelisted(CHAIN, RANDOM)).toBe(false)
  })
  it('shouldSkipPool is false when poolsToSkip is empty', () => {
    expect(shouldSkipPool(CHAIN, RANDOM)).toBe(false)
  })
  it('throws on unsupported chain', () => {
    expect(() => isWhitelisted(999, RANDOM)).toThrow('Unsupported chain: 999')
  })
})
