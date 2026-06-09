import { describe, expect, it } from 'vitest'
import type { ChainConfig } from '../../src/utils/chains'
import {
  resolveTokenDecimals,
  resolveTokenName,
  resolveTokenSymbol,
} from '../../src/utils/tokenEffects'

const NATIVE = '0x0000000000000000000000000000000000000000'
const OVERRIDE = '0x1111111111111111111111111111111111111111'
const NORMAL = '0x2222222222222222222222222222222222222222'

const config: ChainConfig = {
  peripheralAddresses: [],
  wrappedNativeAddress: '',
  stablecoinAddresses: [],
  whitelistTokens: [],
  tokenOverrides: [{ address: OVERRIDE, symbol: 'OVR', name: 'Override Token', decimals: 8 }],
  poolsToSkip: [],
  nativeTokenDetails: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
}

const okClient = {
  readContract: async ({ functionName }: { functionName: string }) =>
    functionName === 'decimals' ? 6 : functionName === 'name' ? 'USD Coin' : 'USDC',
}
const throwClient = {
  readContract: async () => {
    throw new Error('rpc down')
  },
}
const bigDecimalsClient = {
  readContract: async ({ functionName }: { functionName: string }) =>
    functionName === 'decimals' ? 255 : 'X',
}

describe('tokenEffects resolvers', () => {
  it('resolveTokenSymbol: native → config symbol', async () => {
    expect(await resolveTokenSymbol(NATIVE, config, okClient)).toBe('ETH')
  })
  it('resolveTokenSymbol: override → override symbol', async () => {
    expect(await resolveTokenSymbol(OVERRIDE, config, okClient)).toBe('OVR')
  })
  it('resolveTokenSymbol: RPC success → contract symbol', async () => {
    expect(await resolveTokenSymbol(NORMAL, config, okClient)).toBe('USDC')
  })
  it('resolveTokenSymbol: RPC failure → "unknown"', async () => {
    expect(await resolveTokenSymbol(NORMAL, config, throwClient)).toBe('unknown')
  })

  it('resolveTokenName: native → config name', async () => {
    expect(await resolveTokenName(NATIVE, config, okClient)).toBe('Ethereum')
  })
  it('resolveTokenName: override → override name', async () => {
    expect(await resolveTokenName(OVERRIDE, config, okClient)).toBe('Override Token')
  })
  it('resolveTokenName: RPC success → contract name', async () => {
    expect(await resolveTokenName(NORMAL, config, okClient)).toBe('USD Coin')
  })
  it('resolveTokenName: RPC failure → "unknown"', async () => {
    expect(await resolveTokenName(NORMAL, config, throwClient)).toBe('unknown')
  })

  it('resolveTokenDecimals: native → config decimals', async () => {
    expect(await resolveTokenDecimals(NATIVE, config, okClient)).toBe(18)
  })
  it('resolveTokenDecimals: override → override decimals', async () => {
    expect(await resolveTokenDecimals(OVERRIDE, config, okClient)).toBe(8)
  })
  it('resolveTokenDecimals: RPC success → Number(result)', async () => {
    expect(await resolveTokenDecimals(NORMAL, config, okClient)).toBe(6)
  })
  it('resolveTokenDecimals: RPC failure → 0', async () => {
    expect(await resolveTokenDecimals(NORMAL, config, throwClient)).toBe(0)
  })
  it('resolveTokenDecimals: implausible (>= 255) treated as failed read → 0', async () => {
    expect(await resolveTokenDecimals(NORMAL, config, bigDecimalsClient)).toBe(0)
  })
})
