// Port of core-v1 QuadraticSwapFees.calculateSwapFeeBipsQ64; ref:
// github.com/Ammalgam-Protocol/core-v1/blob/master/contracts/libraries/QuadraticSwapFees.sol

const N = 20n
const RESERVE_MULTIPLIER = 2n
const LINEAR_START_REFERENCE_SCALER = 4n
export const MIN_FEE_Q64 = 0x1999999999999999n // 0.1 bips in Q64
const MAX_QUADRATIC_FEE_PERCENT_BIPS = 4000n
const N_TIMES_BIPS_Q64_PER_PERCENT = 0x7d00000000000000000n // N * 100 * Q64
const TWO_Q64 = 0x20000000000000000n
const MAX_QUADRATIC_FEE_Q64 = 0x280000000000000000n // MAX_QUADRATIC_FEE_PERCENT * Q64

export const BIPS_Q64 = 0x27100000000000000000n // 10000 bips in Q64

function calculateQuadraticFeeBipsQ64(weightedDelta: bigint, referenceReserve: bigint): bigint {
  return (N_TIMES_BIPS_Q64_PER_PERCENT * weightedDelta) / referenceReserve
}

function calculateLinearFeeBipsQ64(weightedDelta: bigint, referenceReserve: bigint): bigint {
  return (
    MAX_QUADRATIC_FEE_PERCENT_BIPS *
    (TWO_Q64 - (referenceReserve * MAX_QUADRATIC_FEE_Q64) / (N * weightedDelta))
  )
}

export function calculateSwapFeeBipsQ64(
  input: bigint,
  currentReserve: bigint,
  referenceReserve: bigint,
): bigint {
  if (input === 0n) return 0n

  let fee = 0n
  const currentReserveAfterSwap = input + currentReserve

  if (currentReserve >= referenceReserve) {
    const weightedDelta = input + RESERVE_MULTIPLIER * (currentReserve - referenceReserve)
    if (
      currentReserveAfterSwap + currentReserve >
      referenceReserve * LINEAR_START_REFERENCE_SCALER
    ) {
      fee = calculateLinearFeeBipsQ64(weightedDelta, referenceReserve)
    } else {
      fee = calculateQuadraticFeeBipsQ64(weightedDelta, referenceReserve)
    }
  } else if (currentReserveAfterSwap > referenceReserve) {
    const pastBy = currentReserveAfterSwap - referenceReserve
    fee =
      pastBy > RESERVE_MULTIPLIER * referenceReserve
        ? calculateLinearFeeBipsQ64(pastBy, referenceReserve)
        : calculateQuadraticFeeBipsQ64(pastBy, referenceReserve)
    fee = (fee * pastBy) / input
  }

  return fee > MIN_FEE_Q64 ? fee : MIN_FEE_Q64
}
