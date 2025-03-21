import { Pool, Sync, Token } from '../types/schema'
import { Sync as SyncEvent } from '../types/templates/AmmalgamPair/AmmalgamPair'

import { convertTokenToDecimal, safeDiv } from '../utils'
import { INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'

export function handleSync(event: SyncEvent): void {
  const poolId = event.address.toHex()
  const pool = Pool.load(poolId)!

  const tokenX = Token.load(pool.tokenX)
  const tokenY = Token.load(pool.tokenY)

  if (tokenX && tokenY) {
    // Update the pool with the new reserves
    pool.reserveX = event.params.reserveXAssets
    pool.reserveY = event.params.reserveYAssets
    
    // Convert reserves to native token units for price calculation
    const reserveX = convertTokenToDecimal(pool.reserveX, tokenX.decimals)
    const reserveY = convertTokenToDecimal(pool.reserveY, tokenY.decimals)

    // Update the token prices
    pool.tokenXPrice = safeDiv(reserveX, reserveY)
    pool.tokenYPrice = safeDiv(reserveY, reserveX)

    // Update sync count
    pool.syncCount += INT_ONE

    pool.save()

    // Create a new Sync entity
    const syncId = getEventId(event)
    const sync = new Sync(syncId)

    // Transaction metadata
    sync.hash = event.transaction.hash
    sync.nonce = event.transaction.nonce
    sync.logIndex = event.logIndex.toI32()
    sync.gasPrice = event.transaction.gasPrice
    sync.gasUsed = event.receipt ? event.receipt!.gasUsed : null
    sync.gasLimit = event.transaction.gasLimit
    sync.blockNumber = event.block.number
    sync.timestamp = event.block.timestamp

    // Sync details
    sync.pool = poolId
    sync.reserveX = event.params.reserveXAssets
    sync.reserveY = event.params.reserveYAssets

    sync.save()
  }
}
