import { ethereum } from '@graphprotocol/graph-ts'

import { Pool, Position, User } from '../types/schema'

import { BIGINT_ZERO, DEFAULT_TOKEN_BALANCES, INT_ONE, INT_ZERO } from './constants'
import { getPositionId } from './id'

export function getOrInitPosition(user: User, pool: Pool, event: ethereum.Event): Position {
  const positionId = getPositionId(user.id, pool.id)
  let position = Position.load(positionId)
  if (!position) {
    position = new Position(positionId)

    // Position metadata
    position.user = user.id
    position.pool = pool.id
    position.assets = DEFAULT_TOKEN_BALANCES
    position.shares = DEFAULT_TOKEN_BALANCES
    position.principal = BIGINT_ZERO // Liquidity units

    // Quantitative values
    position.depositCount = INT_ZERO
    position.borrowCount = INT_ZERO
    position.receivedCount = INT_ZERO
    position.repayCount = INT_ZERO
    position.transferredCount = INT_ZERO
    position.withdrawCount = INT_ZERO

    // Transaction metadata
    position.hash = event.transaction.hash
    position.blockNumber = event.block.number
    position.timestamp = event.block.timestamp

    // Update `positionCount`
    pool.positionCount += INT_ONE
    user.positionCount += INT_ONE

    position.save()
    pool.save()
    user.save()
  }

  return position
}
