import { describe, expect, it } from 'vitest'

import { mulDivCeil } from '../../src/utils/math'
import { BIPS_Q64, calculateSwapFeeBipsQ64, MIN_FEE_Q64 } from '../../src/utils/swapFees'

describe('calculateSwapFeeBipsQ64', () => {
  it('returns zero for zero input', () => {
    expect(calculateSwapFeeBipsQ64(0n, 1000n, 1000n)).toBe(0n)
  })

  it('quadratic branch at or above reference', () => {
    expect(calculateSwapFeeBipsQ64(100n, 1000n, 1000n)).toBe(3689348814741910323200n)
  })

  it('linear branch when swap ends past the linear start scaler', () => {
    expect(calculateSwapFeeBipsQ64(5000n, 1000n, 1000n)).toBe(118059162071741130344000n)
  })

  it('past-reference quadratic branch', () => {
    expect(calculateSwapFeeBipsQ64(300n, 900n, 1000n)).toBe(4919131752989213764266n)
  })

  it('past-reference linear branch', () => {
    expect(calculateSwapFeeBipsQ64(5000n, 100n, 1000n)).toBe(91495850605599376018000n)
  })

  it('floors at MIN_FEE_Q64 when price moves toward the reference', () => {
    // current < reference and the swap does not cross it: raw fee is 0, floor applies.
    expect(calculateSwapFeeBipsQ64(10n, 500n, 1000n)).toBe(MIN_FEE_Q64)
  })

  // Golden regression, Sepolia block 11434716 tx 0x2f76c076...c46d02 log 478:
  // reproduces the on-chain amountYOut to 1 wei with these exact inputs.
  it('reproduces the validated Sepolia swap fee (89.4196 bips)', () => {
    const amountXIn = 938103027897437339665111n
    const preSwapReserveX = 14507498325049657264772234n
    const referenceReserveX = 14661423449927442350571665n
    const fee = calculateSwapFeeBipsQ64(amountXIn, preSwapReserveX, referenceReserveX)
    expect(fee).toBe(1649499711640283894283n)
    expect((fee * 10n ** 8n) / 2n ** 64n).toBe(8941955854n) // 89.41955854 bips
    // Ceiling, as the pair retains it. Floor would be one wei lower here.
    expect(mulDivCeil(amountXIn, fee, BIPS_Q64)).toBe(8388475862312569328398n)
    expect((amountXIn * fee) / BIPS_Q64).toBe(8388475862312569328397n)
  })
})
