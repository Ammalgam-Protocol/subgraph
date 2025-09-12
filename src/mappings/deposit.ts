import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Deposit, LendingToken } from '../types/schema'
import { Deposit as DepositEvent } from '../types/templates/ERC4626Deposit/ERC4626Deposit'

import { update } from '../utils/array'
import { BIGINT_ZERO, BORROW_L, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y, INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { convertXToL, convertYToL } from '../utils/pool'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleDeposit(event: DepositEvent): void {
  const lendingTokenAddress = event.address.toHex()
  const lendingToken = LendingToken.load(lendingTokenAddress)

  if (!lendingToken) {
    log.critical('Invalid lendingToken: {}', [lendingTokenAddress])
    return
  }

  const pool = Pool.load(lendingToken.pool)!

  if (pool) {
    const tokenType = lendingToken.tokenType
    const user = getOrInitUser(event.params.owner)
    const position = getOrInitPosition(user, pool, event)

    // Update pool and position deposit data
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

    const activeLiquidity = pool.totalAssets[DEPOSIT_L].minus(pool.totalAssets[BORROW_L])

    let principal = BIGINT_ZERO
    if (tokenType == DEPOSIT_X) {
      principal = convertXToL(event.params.assets, pool.reserveX, activeLiquidity)
    } else if (tokenType == DEPOSIT_Y) {
      principal = convertYToL(event.params.assets, pool.reserveY, activeLiquidity)
    }

    // Update position principal balance in terms of Liquidity
    position.principal = position.principal.plus(principal)

    // Update deposit count
    pool.depositCount += INT_ONE
    pool.txCount += INT_ONE
    position.depositCount += INT_ONE
    user.depositCount += INT_ONE

    pool.save()
    position.save()
    user.save()

    // Create a new Deposit entity
    const depositId = getEventId(event)
    const deposit = new Deposit(depositId)

    // Transaction metadata
    deposit.hash = event.transaction.hash
    deposit.nonce = event.transaction.nonce
    deposit.logIndex = event.logIndex.toI32()
    deposit.gasPrice = event.transaction.gasPrice
    deposit.gasUsed = event.receipt ? event.receipt!.gasUsed : null
    deposit.gasLimit = event.transaction.gasLimit
    deposit.blockNumber = event.block.number
    deposit.timestamp = event.block.timestamp

    // Deposit details
    deposit.asset = lendingToken.id
    deposit.amount = event.params.assets
    deposit.shares = event.params.shares
    deposit.pool = pool.id
    deposit.user = user.id
    deposit.from = getOrInitUser(event.params.sender).id
    deposit.position = position.id

    deposit.save()
  }
}
