import { getEventId } from './id'

export type EventHeaderSource = {
  chainId: number
  logIndex: number
  block: { number: number; timestamp: number }
  transaction: { hash: string }
}

function header(event: EventHeaderSource) {
  return {
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  }
}

export function lendingEventFields(
  event: EventHeaderSource,
  args: {
    userId: string
    senderId: string
    poolId: string
    positionId: string
    assetId: string
    amount: bigint
    shares: bigint
  },
) {
  return {
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    ...header(event),
    user_id: args.userId,
    from_id: args.senderId,
    pool_id: args.poolId,
    position_id: args.positionId,
    asset_id: args.assetId,
    amount: args.amount,
    shares: args.shares,
  }
}

export function transferEventFields(
  event: EventHeaderSource,
  args: {
    senderId: string
    receiverId: string
    poolId: string
    senderPositionId: string
    receiverPositionId: string
    assetId: string
    amount: bigint
    shares: bigint
  },
) {
  return {
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    ...header(event),
    sender_id: args.senderId,
    receiver_id: args.receiverId,
    pool_id: args.poolId,
    senderPosition_id: args.senderPositionId,
    receiverPosition_id: args.receiverPositionId,
    asset_id: args.assetId,
    amount: args.amount,
    shares: args.shares,
  }
}
