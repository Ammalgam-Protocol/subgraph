import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Withdraw, LendingToken, User } from '../types/schema'
import { Withdraw as WithdrawEvent } from '../types/templates/ERC4626Deposit/ERC4626Deposit'

import { update } from '../utils/array'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { BIGINT_ZERO, BORROW_L, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y, INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { convertXToL, convertYToL } from '../utils/pool'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleWithdraw(event: WithdrawEvent): void {
  handleWithdrawHelper(event)
}

export function handleWithdrawHelper(
  event: WithdrawEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const lendingTokenAddress = event.address.toHex()
  const lendingToken = LendingToken.load(lendingTokenAddress)

  if (!lendingToken) {
    log.critical('Invalid lendingToken: {}', [lendingTokenAddress])
    return
  }

  const pool = Pool.load(lendingToken.pool)!

  if (pool) {
    const peripheralAddresses = subgraphConfig.peripheralAddresses
    const tokenType = lendingToken.tokenType
    
    const from = getOrInitUser(event.params.sender)
    
    // When closing position, Peripheral contract burns user `x` or `y` assets
    let user: User
    if (peripheralAddresses.includes(event.params.receiver.toHexString())) {
      user = getOrInitUser(event.transaction.from)
    } else {
      user = getOrInitUser(event.params.receiver)
    }
    
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
    
    const activeLiquidity = pool.totalAssets[DEPOSIT_L].minus(pool.totalAssets[BORROW_L])
    
    let principal = BIGINT_ZERO
    if (tokenType == DEPOSIT_X) {
      principal = convertXToL(event.params.assets, pool.reserveX, activeLiquidity)
    } else if (tokenType == DEPOSIT_Y) {
      principal = convertYToL(event.params.assets, pool.reserveY, activeLiquidity)
    }
    
    // Update position principal balance in terms of Liquidity
    position.principal = position.principal.minus(principal)

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
    withdraw.from = from.id
    withdraw.position = position.id

    withdraw.save()
  }
}
