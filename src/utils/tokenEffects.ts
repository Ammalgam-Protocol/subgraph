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

export async function readTokenMetadata(
  address: string,
  config: ChainConfig,
  client: ReadOnlyClient,
): Promise<{ metadata: { symbol: string; name: string; decimals: number }; hasError: boolean }> {
  let hasError = false
  const _client: ReadOnlyClient = {
    readContract: (args) =>
      client.readContract(args).catch((error) => {
        hasError = true
        throw error
      }),
  }
  const [symbol, name, decimals] = await Promise.all([
    resolveTokenSymbol(address, config, _client),
    resolveTokenName(address, config, _client),
    resolveTokenDecimals(address, config, _client),
  ])
  return { metadata: { symbol, name, decimals }, hasError }
}

// envio's effect dispatch loads this file through its own dynamic import, outside vitest's
// instrumentation, so istanbul records no calls. factory.test.ts covers it end-to-end.
/* istanbul ignore start */
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
  async ({ input, context }) => {
    const { chainId, address } = parseInput(input)
    const { metadata, hasError } = await readTokenMetadata(
      address,
      getChainConfig(chainId),
      getClient(chainId),
    )
    if (hasError) {
      context.cache = false
      context.log.warn(`Token metadata read failed for ${address} on chain ${chainId}`)
    }
    return metadata
  },
)
/* istanbul ignore stop */
