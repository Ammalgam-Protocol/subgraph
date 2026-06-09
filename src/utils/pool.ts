import { DEFAULT_TOKEN_BALANCES, ZERO_BI } from './constants'
import { convertTokenToDecimal, safeDiv, ZERO_BD } from './math'

export function createDefaultPool(
  poolId: string,
  tokenXId: string,
  tokenYId: string,
  name: string,
  createdAtTimestamp: bigint,
  createdAtBlockNumber: bigint,
) {
  return {
    id: poolId,
    tokenX_id: tokenXId,
    tokenY_id: tokenYId,
    name,
    reserveX: ZERO_BI,
    reserveY: ZERO_BI,
    tokenXPrice: ZERO_BD,
    tokenYPrice: ZERO_BD,
    totalAssets: [...DEFAULT_TOKEN_BALANCES],
    totalShares: [...DEFAULT_TOKEN_BALANCES],
    createdAtTimestamp,
    createdAtBlockNumber,
    txCount: 0,
    depositCount: 0,
    withdrawCount: 0,
    borrowCount: 0,
    repayCount: 0,
    transferCount: 0,
    swapCount: 0,
    syncCount: 0,
    liquidateCount: 0,
    interestAccruedCount: 0,
    burnBadDebtCount: 0,
    volumeTokenX: ZERO_BD,
    volumeTokenY: ZERO_BD,
    positionCount: 0,
  }
}

export function poolPriceFields(
  tokenX: { decimals: number },
  tokenY: { decimals: number },
  reserveXAssets: bigint,
  reserveYAssets: bigint,
) {
  const reserveX = convertTokenToDecimal(reserveXAssets, tokenX.decimals)
  const reserveY = convertTokenToDecimal(reserveYAssets, tokenY.decimals)
  return {
    reserveX: reserveXAssets,
    reserveY: reserveYAssets,
    tokenXPrice: safeDiv(reserveX, reserveY),
    tokenYPrice: safeDiv(reserveY, reserveX),
  }
}
