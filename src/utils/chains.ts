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
    peripheralAddresses: ['0xaffc6c525660480da9656165490aa9c27e5ea9b3'],
    wrappedNativeAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    stablecoinAddresses: [
      '0x7a2fc218a5a43b88a622ad9b67a59d3a73c52aad', // USDC
      '0x155b2f181512f0def9d8d2b5630bc735db926fef', // USDT
    ],
    whitelistTokens: [
      '0x0000000000000000000000000000000000000000', // Native ETH
      '0x7a2fc218a5a43b88a622ad9b67a59d3a73c52aad', // USDC
      '0x155b2f181512f0def9d8d2b5630bc735db926fef', // USDT
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
