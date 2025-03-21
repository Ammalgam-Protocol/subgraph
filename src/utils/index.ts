import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { BIGDECIMAL_ZERO, BIGINT_ONE, INT_ZERO } from './constants'

const NULL_ETH_HEX_STRING = '0x0000000000000000000000000000000000000000000000000000000000000001'

// n => 10^n
export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let result = BIGINT_ONE
  const ten = BigInt.fromI32(10)
  for (let i = 0; i < decimals; i++) {
    result = result.times(ten)
  }
  return result.toBigDecimal()
}

// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.equals(BIGDECIMAL_ZERO)) {
    return BIGDECIMAL_ZERO
  } else {
    return amount0.div(amount1)
  }
}

export function hexToBigInt(hex: string): BigInt {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2)
  }
  let decimal = '0'
  for (let i = 0; i < hex.length; i++) {
    decimal = BigInt.fromString(decimal)
      .times(BigInt.fromI32(16))
      .plus(BigInt.fromI32(parseInt(hex.charAt(i), 16) as i32))
      .toString()
  }
  return BigInt.fromString(decimal)
}

export function isNullEthValue(value: string): boolean {
  return value == NULL_ETH_HEX_STRING
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: i32): BigDecimal {
  if (exchangeDecimals === INT_ZERO) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}
