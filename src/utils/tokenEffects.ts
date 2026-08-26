import { createEffect, S } from 'envio'
import { parseAbi } from 'viem'

import { type ChainConfig, getChainConfig } from './chains'
import { ADDRESS_ZERO } from './constants'
import { getClient } from './rpcClient'

const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
])

type ReadOnlyClient = {
  readContract: (args: {
    address: `0x${string}`
    abi: typeof ERC20_ABI
    functionName: 'symbol' | 'name' | 'decimals'
  }) => Promise<unknown>
}

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
    // 255 or more is not a real token scale; treat it as a failed read.
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

// Batched: one effect call per token instead of three separate reads.
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
