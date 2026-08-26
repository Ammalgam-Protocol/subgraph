import { type Chain, createPublicClient, http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

// viem chain per supported chainId: keep in sync with chains.ts CHAIN_CONFIGS.
// The chain object determines the multicall3 address and EIP-1559 assumptions used.
const VIEM_CHAINS: Record<number, Chain> = {
  11155111: sepolia,
  1: mainnet,
}

// Public RPC URLs, used when ENVIO_RPC_URL_<chainId> is unset.
const PUBLIC_RPC_URLS: Record<number, string> = {
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  1: 'https://ethereum-rpc.publicnode.com',
}

// Memoized per chain: idempotent, so the preload double-run cannot corrupt it.
const clients: Record<number, ReturnType<typeof createPublicClient>> = {}

// v8 ignore: only invoked from the effect wrappers, which run inside the Envio
// worker thread (not observable by v8 coverage). Exercised by factory.test.ts.
/* v8 ignore start */
export function getClient(chainId: number) {
  if (!clients[chainId]) {
    const chain = VIEM_CHAINS[chainId]
    if (!chain) throw new Error(`Unsupported chain for RPC client: ${chainId}`)

    // ENVIO_RPC_RETRY_COUNT overrides viem's retry count (default 3).
    const retryEnv = process.env.ENVIO_RPC_RETRY_COUNT

    // ENVIO_ prefix is mandatory: the hosted service only exposes env vars that
    // carry it, so an unprefixed name silently reads as undefined here.
    const rpcUrl = process.env[`ENVIO_RPC_URL_${chainId}`]
    if (!rpcUrl) {
      // Warned once per chain (cache above): affects any archive-dependent caller,
      // e.g. fetchReferenceReserves.
      console.warn(
        `ENVIO_RPC_URL_${chainId} is unset; using a public non-archive endpoint. Historical reads will fail.`,
      )
    }

    clients[chainId] = createPublicClient({
      chain,
      transport: http(
        rpcUrl ?? PUBLIC_RPC_URLS[chainId],
        retryEnv !== undefined ? { retryCount: Number(retryEnv) } : undefined,
      ),
      batch: { multicall: true },
    })
  }
  return clients[chainId]
}
/* v8 ignore stop */
