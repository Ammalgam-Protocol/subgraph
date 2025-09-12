import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { BIGDECIMAL_ZERO, BIGINT_ONE, INT_SIXTYFOUR, INT_ZERO } from './constants'

const NULL_ETH_HEX_STRING = '0x0000000000000000000000000000000000000000000000000000000000000001'

function splitStringIntoChunks(text: string, chunkSize: i32): string[] {
  const chunks: string[] = []
  let i = 0

  while (i < text.length) {
    chunks.push(text.substr(i, chunkSize))
    i += chunkSize
  }

  return chunks
}

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

export function parseLendingTokens(data: string): Address[] {
  if (data.startsWith('0x')) {
    data = data.slice(2)
  }

  // Ethereum addresses are 20 bytes (40 hex chars)
  // In ABI-encoded data, they're padded to 32 bytes (64 hex chars)
  const chunks = splitStringIntoChunks(data, INT_SIXTYFOUR)

  const _lendingTokens: Address[] = []
  for (let i = 0; i < chunks.length; i++) {
    // Extract the actual address part (last 40 chars of each 64-char chunk)
    const _tokenAddress = '0x' + chunks[i].substr(24, 40)
    _lendingTokens.push(Address.fromString(_tokenAddress))
  }

  return _lendingTokens
}
