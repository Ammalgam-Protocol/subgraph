import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Borrow, LendingToken } from '../types/schema'
import { Borrow as BorrowEvent } from '../types/templates/ERC4626Debt/ERC4626Debt'

import { update } from '../utils/array'
import { INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleBorrow(event: BorrowEvent): void {
  const lendingTokenAddress = event.address.toHex()
  const lendingToken = LendingToken.load(lendingTokenAddress)

  if (!lendingToken) {
    log.critical('Invalid lendingToken: {}', [lendingTokenAddress])
    return
  }

  const pool = Pool.load(lendingToken.pool)!

  if (pool) {
    const tokenType = lendingToken.tokenType
    const user = getOrInitUser(event.params.to)
    const position = getOrInitPosition(user, pool, event)

    // Update pool and position borrow data
    pool.totalAssets = update<BigInt>(
      pool.totalAssets,
      pool.totalAssets[tokenType].plus(event.params.assets),
      tokenType,
    )
    pool.totalShares = update<BigInt>(
      pool.totalShares,
      pool.totalShares[tokenType].plus(event.params.shares),
      tokenType,
    )
    position.assets = update<BigInt>(
      position.assets,
      position.assets[tokenType].plus(event.params.assets),
      tokenType,
    )
    position.shares = update<BigInt>(
      position.shares,
      position.shares[tokenType].plus(event.params.shares),
      tokenType,
    )

    // Update position principal balance
    // TODO: `convertXorYToL`
    // position.principal = position.principal.minus(event.params.assets)

    // Update borrow count
    pool.borrowCount += INT_ONE
    pool.txCount += INT_ONE
    position.borrowCount += INT_ONE
    user.borrowCount += INT_ONE

    pool.save()
    position.save()
    user.save()

    // Create a new `Borrow` entity
    const borrowId = getEventId(event)
    const borrow = new Borrow(borrowId)

    // Transaction metadata
    borrow.hash = event.transaction.hash
    borrow.nonce = event.transaction.nonce
    borrow.logIndex = event.logIndex.toI32()
    borrow.gasPrice = event.transaction.gasPrice
    borrow.gasUsed = event.receipt ? event.receipt!.gasUsed : null
    borrow.gasLimit = event.transaction.gasLimit
    borrow.blockNumber = event.block.number
    borrow.timestamp = event.block.timestamp

    // Borrow details
    borrow.asset = lendingToken.id
    borrow.amount = event.params.assets
    borrow.shares = event.params.shares
    borrow.pool = pool.id
    borrow.user = user.id
    borrow.from = getOrInitUser(event.params.sender).id
    borrow.position = position.id

    borrow.save()
  }
}
