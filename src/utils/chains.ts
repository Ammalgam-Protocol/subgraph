import { ADDRESS_ZERO } from './constants'

export interface StaticTokenDefinition {
  address: string
  symbol: string
  name: string
  decimals: number
}

export interface ChainConfig {
  peripheralAddresses: string[]
  wrappedNativeAddress: string
  stablecoinAddresses: string[]
  whitelistTokens: string[]
  tokenOverrides: StaticTokenDefinition[]
  poolsToSkip: string[]
  nativeTokenDetails: { symbol: string; name: string; decimals: number }
}

// All addresses must be lowercase
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  11155111: {
    // Sepolia
    peripheralAddresses: [
      '0x737da85f70db0d93b9d2c189aa7fba0841b8463b',
      '0x5f75c9485f2f47ab6f6887a2f31cdf5ea0bf282d',
      '0x2f2f434b4616b942c9e5b2526b7791e009f18b19',
      '0xfe460940ffb3339fed01efacfbb39417be70e2e8',
    ],
    wrappedNativeAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    stablecoinAddresses: [
      '0x260821c946590213521042ecb215f8ce6f38757d', // DAI
      '0xba27581cf84ee43ec6a354f56ea2e424223d122f', // USDC
      '0x48b717744ac9162766e3c12d81851bfe178e28de', // USDT
    ],
    whitelistTokens: [
      '0x0000000000000000000000000000000000000000', // Native ETH
      '0x260821c946590213521042ecb215f8ce6f38757d', // DAI
      '0xba27581cf84ee43ec6a354f56ea2e424223d122f', // USDC
      '0x48b717744ac9162766e3c12d81851bfe178e28de', // USDT
      '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    nativeTokenDetails: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  },
}

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId]
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`)
  }
  return config
}

interface ChainSets {
  peripheral: Set<string>
  ignoredForTransfer: Set<string>
  whitelist: Set<string>
  poolsToSkip: Set<string>
}

// Immutable, derived once from the static config — preload-safe (never mutated).
const CHAIN_SETS: Record<number, ChainSets> = Object.fromEntries(
  Object.entries(CHAIN_CONFIGS).map(([chainId, config]) => [
    Number(chainId),
    {
      peripheral: new Set(config.peripheralAddresses),
      ignoredForTransfer: new Set([ADDRESS_ZERO, ...config.peripheralAddresses]),
      whitelist: new Set(config.whitelistTokens),
      poolsToSkip: new Set(config.poolsToSkip),
    },
  ]),
)

function getChainSets(chainId: number): ChainSets {
  const sets = CHAIN_SETS[chainId]
  if (!sets) {
    throw new Error(`Unsupported chain: ${chainId}`)
  }
  return sets
}

export function isPeripheral(chainId: number, address: string): boolean {
  return getChainSets(chainId).peripheral.has(address.toLowerCase())
}

export function isIgnoredForTransfer(chainId: number, address: string): boolean {
  return getChainSets(chainId).ignoredForTransfer.has(address.toLowerCase())
}

export function isWhitelisted(chainId: number, address: string): boolean {
  return getChainSets(chainId).whitelist.has(address.toLowerCase())
}

export function shouldSkipPool(chainId: number, address: string): boolean {
  return getChainSets(chainId).poolsToSkip.has(address.toLowerCase())
}

export function resolveBeneficiary(chainId: number, recipient: string, txFrom: string): string {
  return isPeripheral(chainId, recipient) ? txFrom : recipient
}
