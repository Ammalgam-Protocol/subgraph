import { Address } from '@graphprotocol/graph-ts'

import { User } from '../types/schema'

import { INT_ZERO } from './constants'

export function getOrInitUser(address: Address): User {
  let user = User.load(address.toHexString())
  if (!user) {
    user = new User(address.toHexString())
    user.depositCount = INT_ZERO
    user.borrowCount = INT_ZERO
    user.positionCount = INT_ZERO
    user.receivedCount = INT_ZERO
    user.repayCount = INT_ZERO
    user.swapCount = INT_ZERO
    user.transferredCount = INT_ZERO
    user.withdrawCount = INT_ZERO
    user.save()
  }
  return user
}
