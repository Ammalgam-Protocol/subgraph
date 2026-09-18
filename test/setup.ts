import { beforeAll } from 'vitest'

// Force the offline suite onto a deterministic, unreachable RPC so token-metadata
// effects fail fast (connection refused) and resolve via their fallbacks, instead
// of falling through to viem's default *public* Sepolia endpoint (which adds
// latency and makes the "offline" suite network-dependent and flaky).
// The ENVIO_RPC_URL_<chainId> name matches the runtime convention in
// rpcClient.getClient.
beforeAll(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('RPC_URL_') || key.startsWith('ENVIO_RPC_URL_')) {
      delete process.env[key]
    }
  }
  process.env.ENVIO_RPC_URL_11155111 = 'http://127.0.0.1:1'
  // No retry/backoff in tests: each unreachable read fails instantly (ECONNREFUSED),
  // so the effect path is fast and deterministic instead of timing-flaky.
  process.env.ENVIO_RPC_RETRY_COUNT = '0'
})
