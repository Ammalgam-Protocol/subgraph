import { ZERO_BI } from './constants'

export function createDefaultToken(
  id: string,
  metadata: { symbol: string; name: string; decimals: number },
) {
  return {
    id,
    symbol: metadata.symbol,
    name: metadata.name,
    decimals: metadata.decimals,
    poolCount: 0,
    txCount: 0,
    volume: ZERO_BI,
    whitelistPoolIds: [] as string[],
  }
}
