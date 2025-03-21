import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Repay, LendingToken } from '../types/schema'
import { Repay as RepayEvent } from '../types/templates/ERC4626Debt/ERC4626Debt'

import { update } from '../utils/array'
import { INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleRepay(event: RepayEvent): void {
  const lendingTokenAddress = event.address.toHex()
  const lendingToken = LendingToken.load(lendingTokenAddress)

  if (!lendingToken) {
    log.critical('Invalid lendingToken: {}', [lendingTokenAddress])
    return
  }

  const pool = Pool.load(lendingToken.pool)!

  if (pool) {
    const tokenType = lendingToken.tokenType
    const user = getOrInitUser(event.params.onBehalfOf)
    const position = getOrInitPosition(user, pool, event)

    // Update pool and position repay data
    pool.totalAssets = update<BigInt>(
      pool.totalAssets,
      pool.totalAssets[tokenType].minus(event.params.assets),
      tokenType,
    )
    pool.totalShares = update<BigInt>(
      pool.totalShares,
      pool.totalShares[tokenType].minus(event.params.shares),
      tokenType,
    )
    position.assets = update<BigInt>(
      position.assets,
      position.assets[tokenType].minus(event.params.assets),
      tokenType,
    )
    position.shares = update<BigInt>(
      position.shares,
      position.shares[tokenType].minus(event.params.shares),
      tokenType,
    )

    // Update position principal balance
    // TODO: `convertXorYToL`
    // position.principal = position.principal.plus(event.params.assets)

    // Update repay count
    pool.repayCount += INT_ONE
    pool.txCount += INT_ONE
    position.repayCount += INT_ONE
    user.repayCount += INT_ONE

    pool.save()
    position.save()
    user.save()

    // Create a new `Repay` entity
    const repayId = getEventId(event)
    const repay = new Repay(repayId)

    // Transaction metadata
    repay.hash = event.transaction.hash
    repay.nonce = event.transaction.nonce
    repay.logIndex = event.logIndex.toI32()
    repay.gasPrice = event.transaction.gasPrice
    repay.gasUsed = event.receipt ? event.receipt!.gasUsed : null
    repay.gasLimit = event.transaction.gasLimit
    repay.blockNumber = event.block.number
    repay.timestamp = event.block.timestamp

    // repay details
    repay.asset = lendingToken.id
    repay.amount = event.params.assets
    repay.shares = event.params.shares
    repay.pool = pool.id
    repay.user = user.id
    repay.from = getOrInitUser(event.params.sender).id
    repay.position = position.id

    repay.save()
  }
}
