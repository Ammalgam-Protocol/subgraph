import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Withdraw, LendingToken, User } from '../types/schema'
import { Burn as WithdrawEvent } from '../types/templates/ERC20DepositLiquidity/ERC20DepositLiquidity'

import { update } from '../utils/array'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { DEPOSIT_L, INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleWithdrawLiquidity(event: WithdrawEvent): void {
  handleWithdrawLiquidityHelper(event)
}

export function handleWithdrawLiquidityHelper(
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
    const tokenType = DEPOSIT_L

    const from = getOrInitUser(event.params.sender)

    // When closing position, Peripheral contract burns user liquidity assets
    let user: User
    if (peripheralAddresses.includes(event.params.to.toHexString())) {
      user = getOrInitUser(event.transaction.from)
    } else {
      user = getOrInitUser(event.params.to)
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

    // Update position principal balance
    position.principal = position.principal.minus(event.params.assets)

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
