import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Repay, LendingToken, User } from '../types/schema'
import { Repay as RepayEvent } from '../types/templates/ERC4626Debt/ERC4626Debt'

import { update } from '../utils/array'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { BIGINT_ZERO, BORROW_L, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y, INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { convertXToL, convertYToL } from '../utils/pool'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleRepay(event: RepayEvent): void {
  handleRepayHelper(event)
}

export function handleRepayHelper(
  event: RepayEvent,
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

    // When closing position, Peripheral contract repays `x` or `y` on behalf of user
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

    const activeLiquidity = pool.totalAssets[DEPOSIT_L].minus(pool.totalAssets[BORROW_L])

    let principal = BIGINT_ZERO
    if (tokenType == DEPOSIT_X) {
      principal = convertXToL(event.params.assets, pool.reserveX, activeLiquidity)
    } else if (tokenType == DEPOSIT_Y) {
      principal = convertYToL(event.params.assets, pool.reserveY, activeLiquidity)
    }

    // Update position principal balance in terms of Liquidity
    position.principal = position.principal.plus(principal)

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
