import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Withdraw, LendingToken } from '../types/schema'
import { Withdraw as WithdrawEvent } from '../types/templates/ERC4626Deposit/ERC4626Deposit'

import { update } from '../utils/array'
import { INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleWithdraw(event: WithdrawEvent): void {
  const lendingTokenAddress = event.address.toHex()
  const lendingToken = LendingToken.load(lendingTokenAddress)

  if (!lendingToken) {
    log.critical('Invalid lendingToken: {}', [lendingTokenAddress])
    return
  }

  const pool = Pool.load(lendingToken.pool)!

  if (pool) {
    const tokenType = lendingToken.tokenType
    const user = getOrInitUser(event.params.receiver)
    const position = getOrInitPosition(user, pool, event)

    // Update pool and position deposit data
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
    // position.principal = position.principal.minus(event.params.assets)

    // Update withdraw count
    pool.withdrawCount += INT_ONE
    pool.txCount += INT_ONE
    position.withdrawCount += INT_ONE
    user.withdrawCount += INT_ONE

    pool.save()
    position.save()
    user.save()

    // Create a new `Withdraw` entity
    const withdrawId = getEventId(event)
    const withdraw = new Withdraw(withdrawId)

    // Transaction metadata
    withdraw.hash = event.transaction.hash
    withdraw.nonce = event.transaction.nonce
    withdraw.logIndex = event.logIndex.toI32()
    withdraw.gasPrice = event.transaction.gasPrice
    withdraw.gasUsed = event.receipt ? event.receipt!.gasUsed : null
    withdraw.gasLimit = event.transaction.gasLimit
    withdraw.blockNumber = event.block.number
    withdraw.timestamp = event.block.timestamp

    // Withdraw details
    withdraw.asset = lendingToken.id
    withdraw.amount = event.params.assets
    withdraw.shares = event.params.shares
    withdraw.pool = pool.id
    withdraw.user = user.id
    withdraw.from = getOrInitUser(event.params.sender).id
    withdraw.position = position.id

    withdraw.save()
  }
}
