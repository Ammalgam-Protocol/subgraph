import type { GovernanceEvent } from 'envio'

import { getEventId } from './id'

export type EventHeaderSource = {
  chainId: number
  logIndex: number
  block: { number: number; timestamp: number }
  transaction: { hash: string }
}

export function header(event: EventHeaderSource) {
  return {
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
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

type GovernanceFieldName = Exclude<
  keyof GovernanceEvent,
  keyof ReturnType<typeof header> | 'kind' | 'contract'
>

const UNSET_GOVERNANCE_FIELDS: Record<GovernanceFieldName, undefined> = {
  operationId: undefined,
  index: undefined,
  target: undefined,
  value: undefined,
  data: undefined,
  predecessor: undefined,
  delay: undefined,
  oldDuration: undefined,
  newDuration: undefined,
  role: undefined,
  account: undefined,
  sender: undefined,
  implementation: undefined,
  by: undefined,
  newOwner: undefined,
  previousOwner: undefined,
  feeTo: undefined,
  feeToSetter: undefined,
}

export function governanceEventFields(
  event: EventHeaderSource,
  args: {
    kind: GovernanceEvent['kind']
    contract: string
    fields: Partial<Pick<GovernanceEvent, GovernanceFieldName>>
  },
): GovernanceEvent {
  return {
    ...header(event),
    ...UNSET_GOVERNANCE_FIELDS,
    kind: args.kind,
    contract: args.contract,
    ...args.fields,
  }
}
