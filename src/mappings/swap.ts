import { Swap as SwapEvent } from '../types/AmmalgamFactory/AmmalgamPair'
import { Pool, Swap, Token } from '../types/schema'

import { INT_ONE } from '../utils/constants'
import { convertTokenToDecimal } from '../utils'
import { getEventId } from '../utils/id'
import { getOrInitUser } from '../utils/user'

export function handleSwap(event: SwapEvent): void {
  handleSwapHelper(event)
}

export function handleSwapHelper(event: SwapEvent): void {
  const poolId = event.address.toHexString()
  const pool = Pool.load(poolId)!

  const tokenX = Token.load(pool.tokenX)
  const tokenY = Token.load(pool.tokenY)

  if (tokenX === null || tokenY === null) {
    return
  }

  const amountXIn = convertTokenToDecimal(event.params.amountXIn, tokenX.decimals)
  const amountXOut = convertTokenToDecimal(event.params.amountXOut, tokenX.decimals)
  const amountYIn = convertTokenToDecimal(event.params.amountYIn, tokenY.decimals)
  const amountYOut = convertTokenToDecimal(event.params.amountYOut, tokenY.decimals)

  // totals for volume updates
  const amountXTotal = amountXOut.plus(amountXIn)
  const amountYTotal = amountYOut.plus(amountYIn)

  // update tokenX and tokenY global volume
  tokenX.volume = tokenX.volume.plus(amountXTotal)
  tokenY.volume = tokenY.volume.plus(amountYTotal)

  // Update pool and underlying tokens transaction counts
  tokenX.txCount += INT_ONE
  tokenY.txCount += INT_ONE
  pool.swapCount += INT_ONE
  pool.txCount += INT_ONE

  // update Pool volume data
  pool.volumeTokenX = pool.volumeTokenX.plus(amountXTotal)
  pool.volumeTokenY = pool.volumeTokenY.plus(amountYTotal)

  // save entities
  pool.save()
  tokenX.save()
  tokenY.save()

  // Create a new Swap entity
  const swapId = getEventId(event)
  const swap = new Swap(swapId)
  const user = getOrInitUser(event.transaction.from)

  // Transaction metadata
  swap.hash = event.transaction.hash
  swap.nonce = event.transaction.nonce
  swap.logIndex = event.logIndex.toI32()
  swap.gasPrice = event.transaction.gasPrice
  swap.gasUsed = event.receipt ? event.receipt!.gasUsed : null
  swap.gasLimit = event.transaction.gasLimit
  swap.blockNumber = event.block.number
  swap.timestamp = event.block.timestamp

  // Swap details
  swap.pool = pool.id
  swap.tokenX = pool.tokenX
  swap.tokenY = pool.tokenY
  swap.sender = getOrInitUser(event.params.sender).id
  swap.from = user.id
  swap.to = getOrInitUser(event.params.to).id
  swap.amountXIn = event.params.amountXIn
  swap.amountXOut = event.params.amountXOut
  swap.amountYIn = event.params.amountYIn
  swap.amountYOut = event.params.amountYOut
  swap.save()

  // Increment user swap count
  user.swapCount += INT_ONE
  user.save()
}
