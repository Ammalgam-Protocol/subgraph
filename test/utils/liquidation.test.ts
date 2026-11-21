import { describe, expect, it } from 'vitest'

import {
  liquidationKind,
  liquidationPremiumFields,
  MAX_PREMIUM_BIPS_VALUE,
  premiumBips,
  valueInX,
} from '../../src/utils/liquidation'

describe('liquidationKind', () => {
  it('maps the three contract types and rejects everything else', () => {
    expect(liquidationKind(0n)).toBe('HARD')
    expect(liquidationKind(1n)).toBe('SATURATION')
    expect(liquidationKind(2n)).toBe('LEVERAGE')
    expect(liquidationKind(3n)).toBeUndefined()
    expect(liquidationKind(2n ** 200n)).toBeUndefined()
  })
})

describe('valueInX', () => {
  it('prices y at reserveX / reserveY', () => {
    expect(valueInX(10n, 50n, 200n, 100n)).toBe(110n)
  })

  it('floors the y leg', () => {
    expect(valueInX(0n, 1n, 1n, 3n)).toBe(0n)
  })

  it('returns x alone when reserveY is zero', () => {
    expect(valueInX(7n, 999n, 100n, 0n)).toBe(7n)
  })
})

describe('premiumBips', () => {
  it('is 10000 at par', () => {
    expect(premiumBips(500n, 500n)).toBe(10000)
  })

  it('floors seized * 10000 / repaid', () => {
    expect(premiumBips(8916280484n, 8724205259n)).toBe(10220)
    expect(premiumBips(1n, 3n)).toBe(3333)
  })

  it('is undefined when nothing was repaid', () => {
    expect(premiumBips(100n, 0n)).toBeUndefined()
  })

  it('clamps to the largest value an Int column can hold', () => {
    expect(premiumBips(10n ** 30n, 1n)).toBe(MAX_PREMIUM_BIPS_VALUE)
    expect(MAX_PREMIUM_BIPS_VALUE).toBe(2147483647)
  })
})

describe('liquidationPremiumFields', () => {
  const reserveX = 32858182694n
  const reserveY = 520226901381038837560n
  const activeLiquidity = 4134454083420409n

  it('reproduces the mainnet hard liquidation', () => {
    const result = liquidationPremiumFields({
      seized: [560955433922138n, 0n, 0n],
      repaid: [274894784366n, 8719835859n, 0n],
      reserveX,
      reserveY,
      activeLiquidity,
    })
    expect(result).toEqual({
      seizedLAsX: 4458140242n,
      seizedLAsY: 70583467929276313196n,
      repaidDebtLAsX: 2184700n,
      repaidDebtLAsY: 34589249025647332n,
      premiumBips: 10220,
    })
  })

  it('converts repaidDebtLAssets to X and Y for a second mainnet case', () => {
    const result = liquidationPremiumFields({
      seized: [0n, 0n, 0n],
      repaid: [740598538817n, 0n, 0n],
      reserveX: 27150617281n,
      reserveY: 470702779062403134639n,
      activeLiquidity: 3574894544937851n,
    })
    expect(result.repaidDebtLAsX).toBe(5624699n)
    expect(result.repaidDebtLAsY).toBe(97513866775272200n)
  })

  it('has a null premium when no debt was repaid', () => {
    const result = liquidationPremiumFields({
      seized: [1000n, 5n, 5n],
      repaid: [0n, 0n, 0n],
      reserveX: 100n,
      reserveY: 100n,
      activeLiquidity: 100n,
    })
    expect(result.premiumBips).toBeUndefined()
    expect(result.seizedLAsX).toBe(1000n)
    expect(result.seizedLAsY).toBe(1000n)
    expect(result.repaidDebtLAsX).toBe(0n)
    expect(result.repaidDebtLAsY).toBe(0n)
  })

  it('converts nothing when active liquidity is zero', () => {
    const result = liquidationPremiumFields({
      seized: [1000n, 10n, 0n],
      repaid: [0n, 10n, 0n],
      reserveX: 100n,
      reserveY: 100n,
      activeLiquidity: 0n,
    })
    expect(result).toEqual({
      seizedLAsX: 0n,
      seizedLAsY: 0n,
      repaidDebtLAsX: 0n,
      repaidDebtLAsY: 0n,
      premiumBips: 10000,
    })
  })
})
