import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Repay, LendingToken, User } from '../types/schema'
import { RepayLiquidity as RepayLiquidityEvent } from '../types/templates/ERC20DebtLiquidity/ERC20DebtLiquidity'

import { update } from '../utils/array'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { BORROW_L, INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleRepayLiquidity(event: RepayLiquidityEvent): void {
  handleRepayLiquidityHelper(event)
}

export function handleRepayLiquidityHelper(
  event: RepayLiquidityEvent,
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
    const tokenType = BORROW_L

    const from = getOrInitUser(event.params.sender)

    // When closing position, Peripheral contract repays liquidity on behalf of user
    let user: User
    if (peripheralAddresses.includes(event.params.onBehalfOf.toHexString())) {
      user = getOrInitUser(event.transaction.from)
    } else {
      user = getOrInitUser(event.params.onBehalfOf)
    }

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
    position.principal = position.principal.plus(event.params.assets)

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
    repay.from = from.id
    repay.position = position.id

    repay.save()
  }
}
