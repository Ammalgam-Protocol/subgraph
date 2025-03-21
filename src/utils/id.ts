import { ethereum } from '@graphprotocol/graph-ts'

export function getEventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString().concat('-').concat(event.logIndex.toString())
}

export function getPositionId(userId: string, poolId: string): string {
  return userId.concat('-').concat(poolId)
}
