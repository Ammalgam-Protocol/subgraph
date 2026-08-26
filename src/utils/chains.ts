export interface StaticTokenDefinition {
  address: string
  symbol: string
  name: string
  decimals: number
}

export interface ChainConfig {
  wrappedNativeAddress: string
  stablecoinAddresses: string[]
  whitelistTokens: string[]
  tokenOverrides: StaticTokenDefinition[]
  poolsToSkip: string[]
  nativeTokenDetails: { symbol: string; name: string; decimals: number }
  // Archive eth_call budget per second for effects on this chain. Config rather than an
  // ENVIO_ env var so it survives a redeploy. 10/s fits inside a 300 CU/s provider tier
  // (eth_call is ~26 CU on Alchemy); raise it only after measuring the configured endpoint.
  rpcCallsPerSecond: number
}

// All addresses must be lowercase
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  11155111: {
    // Sepolia
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
      '0x7e30783246a50ca74c1f4862df62f7d9ae07b304', // WBTC
      '0x63145437b3e47f08a6dad3f4688e1389dea310ed', // PEPE
      '0xb403bb708512205515806053c8b1671a5d87fa39', // SHIB
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    nativeTokenDetails: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    rpcCallsPerSecond: 10,
  },
  1: {
    // Ethereum Mainnet
    wrappedNativeAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    stablecoinAddresses: [
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    ],
    whitelistTokens: [
      '0x0000000000000000000000000000000000000000', // Native ETH
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    nativeTokenDetails: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    rpcCallsPerSecond: 10,
  },
}

export const SUPPORTED_CHAIN_IDS: number[] = Object.keys(CHAIN_CONFIGS).map(Number)

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId]
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`)
  }
  return config
}

interface ChainSets {
  whitelist: Set<string>
  poolsToSkip: Set<string>
}

// Immutable, derived once from the static config.
const CHAIN_SETS: Record<number, ChainSets> = Object.fromEntries(
  Object.entries(CHAIN_CONFIGS).map(([chainId, config]) => [
    Number(chainId),
    {
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

export function isWhitelisted(chainId: number, address: string): boolean {
  return getChainSets(chainId).whitelist.has(address.toLowerCase())
}

export function shouldSkipPool(chainId: number, address: string): boolean {
  return getChainSets(chainId).poolsToSkip.has(address.toLowerCase())
}
