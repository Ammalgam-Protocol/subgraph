import { createEffect, S } from 'envio'
import { type Chain, createPublicClient, http, parseAbi } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

import { type ChainConfig, getChainConfig } from './chains'
import { ADDRESS_ZERO } from './constants'

const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
])

// viem chain per supported chainId: keep in sync with chains.ts CHAIN_CONFIGS.
// The chain object determines the multicall3 address and EIP-1559 assumptions used.
const VIEM_CHAINS: Record<number, Chain> = {
  11155111: sepolia,
  1: mainnet,
}

// Public RPC URLs for each chain to fetch token metadata.
const PUBLIC_RPC_URLS: Record<number, string> = {
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  1: 'https://ethereum-rpc.publicnode.com',
}

// `viem` client type for read-only operations.
type ReadOnlyClient = {
  readContract: (args: {
    address: `0x${string}`
    abi: typeof ERC20_ABI
    functionName: 'symbol' | 'name' | 'decimals'
  }) => Promise<unknown>
}

const clients: Record<number, ReturnType<typeof createPublicClient>> = {}
// v8 ignore: only invoked from the effect wrappers, which run inside the Envio
// worker thread (not observable by v8 coverage). Exercised by factory.test.ts.
/* v8 ignore start */
function getClient(chainId: number) {
  if (!clients[chainId]) {
    const chain = VIEM_CHAINS[chainId]
    if (!chain) throw new Error(`Unsupported chain for RPC client: ${chainId}`)
    // ENVIO_ prefix is mandatory: the hosted service only exposes env vars that
    // ENVIO_RPC_RETRY_COUNT overrides viem's retry count (default 3)
    const retryEnv = process.env.ENVIO_RPC_RETRY_COUNT
    const rpcUrl = process.env[`ENVIO_RPC_URL_${chainId}`] ?? PUBLIC_RPC_URLS[chainId]
    clients[chainId] = createPublicClient({
      chain,
      transport: http(
        rpcUrl,
        retryEnv !== undefined ? { retryCount: Number(retryEnv) } : undefined,
      ),
      batch: { multicall: true },
    })
  }
  return clients[chainId]
}
/* v8 ignore stop */

function findOverride(address: string, config: ChainConfig) {
  return config.tokenOverrides.find((t) => t.address.toLowerCase() === address.toLowerCase())
}

export async function resolveTokenSymbol(
  address: string,
  config: ChainConfig,
  client: ReadOnlyClient,
): Promise<string> {
  if (address === ADDRESS_ZERO) return config.nativeTokenDetails.symbol
  const override = findOverride(address, config)
  if (override) return override.symbol
  try {
    return (await client.readContract({
      address: address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'symbol',
    })) as string
  } catch {
    return 'unknown'
  }
}

export async function resolveTokenName(
  address: string,
  config: ChainConfig,
  client: ReadOnlyClient,
): Promise<string> {
  if (address === ADDRESS_ZERO) return config.nativeTokenDetails.name
  const override = findOverride(address, config)
  if (override) return override.name
  try {
    return (await client.readContract({
      address: address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'name',
    })) as string
  } catch {
    return 'unknown'
  }
}

export async function resolveTokenDecimals(
  address: string,
  config: ChainConfig,
  client: ReadOnlyClient,
): Promise<number> {
  if (address === ADDRESS_ZERO) return config.nativeTokenDetails.decimals
  const override = findOverride(address, config)
  if (override) return override.decimals
  try {
    const result = await client.readContract({
      address: address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })
    const decimals = Number(result)
    // Return 0 if the decimals value is >= 255, as this is an invalid value.
    return decimals < 255 ? decimals : 0
  } catch {
    return 0
  }
}

// v8 ignore: parseInput and the createEffect wrappers below run only inside the Envio worker thread.
/* v8 ignore start */
function parseInput(input: string): { chainId: number; address: string } {
  const [chainIdStr, address] = input.split(':')
  return { chainId: Number(chainIdStr), address }
}

// Single batched metadata effect: one effect call per token resolves symbol, name and decimals together.
export const fetchTokenMetadata = createEffect(
  {
    name: 'fetchTokenMetadata',
    input: S.string,
    output: { symbol: S.string, name: S.string, decimals: S.number },
    rateLimit: false,
    cache: true,
  },
  async ({ input }) => {
    const { chainId, address } = parseInput(input)
    const config = getChainConfig(chainId)
    const client = getClient(chainId)
    const [symbol, name, decimals] = await Promise.all([
      resolveTokenSymbol(address, config, client),
      resolveTokenName(address, config, client),
      resolveTokenDecimals(address, config, client),
    ])
    return { symbol, name, decimals }
  },
)
/* v8 ignore stop */
