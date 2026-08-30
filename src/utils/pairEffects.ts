import type { EvmOnEventContext } from 'envio'
import { createEffect, S } from 'envio'
import { parseAbi } from 'viem'

import { getChainConfig, SUPPORTED_CHAIN_IDS } from './chains'
import { getClient } from './rpcClient'

export type ReferenceReserveObservation = { referenceReserveX: bigint; referenceReserveY: bigint }

// v8 ignore: worker-thread only, and PAIR_ABI has no in-process consumer.
/* v8 ignore start */
const PAIR_ABI = parseAbi(['function referenceReserves() view returns (uint112, uint112)'])

// Resolves to end-of-block state, so a block mixing a swap with any reserve-changing action
// returns the reference the swap did not price against: see docs/ARCHITECTURE.md. Needs an
// archive-capable ENVIO_RPC_URL_<chainId>; without one the read fails and fee fields stay null.
function createReferenceReservesEffect(chainId: number) {
  return createEffect(
    {
      name: `fetchReferenceReserves_${chainId}`,
      input: S.string,
      output: { referenceReserveX: S.bigint, referenceReserveY: S.bigint },
      rateLimit: { calls: getChainConfig(chainId).rpcCallsPerSecond, per: 'second' },
      cache: true,
    },
    async ({ input }) => {
      const [address, blockNumber] = input.split(':')
      const [referenceReserveX, referenceReserveY] = await getClient(chainId).readContract({
        address: address as `0x${string}`,
        abi: PAIR_ABI,
        functionName: 'referenceReserves',
        blockNumber: BigInt(blockNumber),
      })
      return { referenceReserveX, referenceReserveY }
    },
  )
}

// One effect per chain because rateLimit is a static createEffect option: a per-chain budget
// needs a per-chain effect, and each carries its own cache table. Derived once from static
// config, so the preload double-run cannot corrupt it.
const REFERENCE_RESERVE_EFFECTS = new Map(
  SUPPORTED_CHAIN_IDS.map((chainId) => [chainId, createReferenceReservesEffect(chainId)]),
)

function getReferenceReservesEffect(chainId: number) {
  const effect = REFERENCE_RESERVE_EFFECTS.get(chainId)
  if (!effect) throw new Error(`Unsupported chain for reference reserves: ${chainId}`)
  return effect
}

export async function readReferenceReserves(
  context: EvmOnEventContext,
  chainId: number,
  pairAddress: string,
  blockNumber: number,
): Promise<ReferenceReserveObservation | undefined> {
  try {
    return await context.effect(
      getReferenceReservesEffect(chainId),
      `${pairAddress}:${blockNumber}`,
    )
  } catch {
    return undefined
  }
}
/* v8 ignore stop */
