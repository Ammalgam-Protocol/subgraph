import { createEffect, S } from 'envio'
import { type Chain, createPublicClient, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'

import { type ChainConfig, getChainConfig } from './chains'
import { ADDRESS_ZERO } from './constants'

const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
])

// viem chain per supported chainId — keep in sync with chains.ts CHAIN_CONFIGS.
// Using the correct chain object ensures the right multicall3 address and
// EIP-1559 assumptions for each network (not always Sepolia's).
const VIEM_CHAINS: Record<number, Chain> = {
  11155111: sepolia,
}

// Narrow structural dependency: resolvers only need "read a contract function
// and get a value back". Decoupling from viem's heavily-generic readContract
// signature lets plain mock clients satisfy this in tests under tsc.
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
    // start with ENVIO_ at runtime (see indexer-configuration skill).
    // ENVIO_RPC_RETRY_COUNT overrides viem's retry count (default 3); the offline
    // test suite sets it to 0 so unreachable-RPC reads fail instantly/deterministically.
    const retryEnv = process.env.ENVIO_RPC_RETRY_COUNT
    clients[chainId] = createPublicClient({
      chain,
      transport: http(
        process.env[`ENVIO_RPC_URL_${chainId}`],
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
    // Mirror the original subgraph: treat an implausible decimals value (>= 255)
    // as a failed read (return 0) rather than scaling amounts by 10^255, which
    // would collapse every amount for this token to ~0.
    return decimals < 255 ? decimals : 0
  } catch {
    return 0
  }
}

// v8 ignore: parseInput and the createEffect wrappers below run only inside the
// Envio worker thread when handlers call context.effect, which v8 coverage cannot
// observe. Their behavior is exercised end-to-end by factory.test.ts; the branchy
// resolver logic above is unit-tested directly at 100%.
/* v8 ignore start */
function parseInput(input: string): { chainId: number; address: string } {
  const [chainIdStr, address] = input.split(':')
  return { chainId: Number(chainIdStr), address }
}

// Single batched metadata effect: one effect call per token resolves symbol,
// name and decimals together (the underlying viem reads are multicall-batched),
// instead of three separate sequential effect awaits per token.
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
