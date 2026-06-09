import { describe, expect, it } from 'vitest'
import {
  getChainConfig,
  isIgnoredForTransfer,
  isPeripheral,
  isWhitelisted,
  resolveBeneficiary,
  shouldSkipPool,
} from '../../src/utils/chains'

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

const CHAIN = 11155111
const PERIPHERAL = '0x737da85f70db0d93b9d2c189aa7fba0841b8463b'
const WETH = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14'
const RANDOM = '0x1111111111111111111111111111111111111111'
const ZERO = '0x0000000000000000000000000000000000000000'

describe('chain lookups', () => {
  it('isPeripheral matches case-insensitively', () => {
    expect(isPeripheral(CHAIN, PERIPHERAL.toUpperCase())).toBe(true)
    expect(isPeripheral(CHAIN, RANDOM)).toBe(false)
  })
  it('isIgnoredForTransfer covers ADDRESS_ZERO and peripheral', () => {
    expect(isIgnoredForTransfer(CHAIN, ZERO)).toBe(true)
    expect(isIgnoredForTransfer(CHAIN, PERIPHERAL)).toBe(true)
    expect(isIgnoredForTransfer(CHAIN, RANDOM)).toBe(false)
  })
  it('isWhitelisted matches whitelist tokens', () => {
    expect(isWhitelisted(CHAIN, WETH)).toBe(true)
    expect(isWhitelisted(CHAIN, RANDOM)).toBe(false)
  })
  it('shouldSkipPool is false when poolsToSkip is empty', () => {
    expect(shouldSkipPool(CHAIN, RANDOM)).toBe(false)
  })
  it('resolveBeneficiary rewrites peripheral recipients to txFrom', () => {
    expect(resolveBeneficiary(CHAIN, PERIPHERAL, RANDOM)).toBe(RANDOM)
    expect(resolveBeneficiary(CHAIN, WETH, RANDOM)).toBe(WETH)
  })
  it('throws on unsupported chain', () => {
    expect(() => isPeripheral(999, RANDOM)).toThrow('Unsupported chain: 999')
  })
})
