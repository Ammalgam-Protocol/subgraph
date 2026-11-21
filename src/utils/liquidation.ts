import { BIPS } from './constants'
import { convertLToXAndY } from './math'
import type { LendingAssets } from './position'

export type LiquidationKind = 'HARD' | 'SATURATION' | 'LEVERAGE'

export const MAX_PREMIUM_BIPS_VALUE = 2147483647

export function liquidationKind(liquidationType: bigint): LiquidationKind | undefined {
  if (liquidationType === 0n) return 'HARD'
  if (liquidationType === 1n) return 'SATURATION'
  if (liquidationType === 2n) return 'LEVERAGE'
  return undefined
}

export function valueInX(x: bigint, y: bigint, reserveX: bigint, reserveY: bigint): bigint {
  if (reserveY === 0n) return x
  return x + (y * reserveX) / reserveY
}

export function premiumBips(seizedValueX: bigint, repaidValueX: bigint): number | undefined {
  if (repaidValueX === 0n) return undefined
  const bips = (seizedValueX * BIPS) / repaidValueX
  return bips > BigInt(MAX_PREMIUM_BIPS_VALUE) ? MAX_PREMIUM_BIPS_VALUE : Number(bips)
}

export function liquidationPremiumFields(args: {
  seized: LendingAssets
  repaid: LendingAssets
  reserveX: bigint
  reserveY: bigint
  activeLiquidity: bigint
}): {
  seizedLAsX: bigint
  seizedLAsY: bigint
  repaidDebtLAsX: bigint
  repaidDebtLAsY: bigint
  premiumBips: number | undefined
} {
  const { seized, repaid, reserveX, reserveY, activeLiquidity } = args
  const seizedL = convertLToXAndY(seized[0], reserveX, reserveY, activeLiquidity)
  const repaidL = convertLToXAndY(repaid[0], reserveX, reserveY, activeLiquidity)
  const seizedValueX = valueInX(seized[1] + seizedL.x, seized[2] + seizedL.y, reserveX, reserveY)
  const repaidValueX = valueInX(repaid[1] + repaidL.x, repaid[2] + repaidL.y, reserveX, reserveY)
  return {
    seizedLAsX: seizedL.x,
    seizedLAsY: seizedL.y,
    repaidDebtLAsX: repaidL.x,
    repaidDebtLAsY: repaidL.y,
    premiumBips: premiumBips(seizedValueX, repaidValueX),
  }
}
