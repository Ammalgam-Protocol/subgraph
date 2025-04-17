import { BigInt, log } from '@graphprotocol/graph-ts'

import { Pool, Borrow, LendingToken, User } from '../types/schema'
import { BorrowLiquidity as BorrowLiquidityEvent } from '../types/templates/ERC20DebtLiquidity/ERC20DebtLiquidity'

import { update } from '../utils/array'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { BORROW_L, INT_ONE } from '../utils/constants'
import { getEventId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleBorrowLiquidity(event: BorrowLiquidityEvent): void {
  handleBorrowLiquidityHelper(event)
}

export function handleBorrowLiquidityHelper(
  event: BorrowLiquidityEvent,
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
    
    // When closing position, Peripheral contract borrows liquidity on behalf of user
    let user: User
    if (peripheralAddresses.includes(event.params.to.toHexString())) {
      user = getOrInitUser(event.transaction.from)
    } else {
      user = getOrInitUser(event.params.to)
    }
    
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
    position.principal = position.principal.minus(event.params.assets)

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
    borrow.from = from.id
    borrow.position = position.id

    borrow.save()
  }
}
