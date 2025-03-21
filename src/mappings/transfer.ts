import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import { Transfer as TransferEvent } from '../types/AmmalgamFactory/ERC20'
import { LendingToken, Pool, Position, Transfer } from '../types/schema'

import { update } from '../utils/array'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { INT_ONE } from '../utils/constants'
import { getEventId, getPositionId } from '../utils/id'
import { getOrInitPosition } from '../utils/position'
import { getOrInitUser } from '../utils/user'

export function handleTransfer(event: TransferEvent): void {
  handleTransferHelper(event)
}

export function handleTransferHelper(
  event: TransferEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const peripheralAddresses = subgraphConfig.peripheralAddresses
  const ignoredAddresses = [Address.zero()]

  for (let i = 0; i < peripheralAddresses.length; i++) {
    const address = peripheralAddresses[i]
    ignoredAddresses.push(Address.fromString(address))
  }

  if (
    ignoredAddresses.includes(event.params.from) ||
    ignoredAddresses.includes(event.params.to) ||
    event.params.value.isZero()
  ) {
    // ignore Borrow / Burn / Deposit / Mint / Repay / Withdraw transfer events
    return
  }

  const lendingTokenAddress = event.address.toHex()
  const lendingToken = LendingToken.load(lendingTokenAddress)

  if (!lendingToken) {
    log.critical('Invalid lendingToken: {}', [lendingTokenAddress])
    return
  }

  const pool = Pool.load(lendingToken.pool)!

  if (pool) {
    const poolAddress = Address.fromString(pool.id)
    if ([event.params.from, event.params.to].includes(poolAddress)) {
      // ignore AmmalgamPair transfer events
      return
    }

    const tokenType = lendingToken.tokenType
    const sender = getOrInitUser(event.params.from)

    const senderPositionId = getPositionId(sender.id, pool.id)
    const senderPosition = Position.load(senderPositionId)
    if (!senderPosition) {
      log.critical('Position {} not found', [senderPositionId])
      return
    }

    // Update `sender` position data
    // TODO: Update it to `assets` after deploying latest core contracts
    senderPosition.assets = update<BigInt>(
      senderPosition.assets,
      senderPosition.assets[tokenType].minus(event.params.value),
      tokenType,
    )
    senderPosition.shares = update<BigInt>(
      senderPosition.shares,
      senderPosition.shares[tokenType].minus(event.params.value),
      tokenType,
    )

    // Update `sender` position principal balance
    // TODO: `convertXorYToL`
    // senderPosition.principal = senderPosition.principal.minus(event.params.value)

    const receiver = getOrInitUser(event.params.to)
    const receiverPosition = getOrInitPosition(receiver, pool, event)

    // Update `receiver` position data
    // TODO: Update it to `assets` after deploying latest core contracts
    receiverPosition.assets = update<BigInt>(
      receiverPosition.assets,
      receiverPosition.assets[tokenType].plus(event.params.value),
      tokenType,
    )
    receiverPosition.shares = update<BigInt>(
      receiverPosition.shares,
      receiverPosition.shares[tokenType].plus(event.params.value),
      tokenType,
    )

    // Update `receiver` position principal balance
    // TODO: `convertXorYToL`
    // receiverPosition.principal = receiverPosition.principal.plus(event.params.value)

    // Update transfer count for both users
    pool.transferCount += INT_ONE
    pool.txCount += INT_ONE
    sender.transferredCount += INT_ONE
    senderPosition.transferredCount += INT_ONE
    receiver.receivedCount += INT_ONE
    receiverPosition.receivedCount += INT_ONE

    pool.save()
    senderPosition.save()
    receiverPosition.save()
    sender.save()
    receiver.save()

    // Create a new `Transfer` entity
    const transferId = getEventId(event)
    const transfer = new Transfer(transferId)

    // Transaction metadata
    transfer.hash = event.transaction.hash
    transfer.nonce = event.transaction.nonce
    transfer.logIndex = event.logIndex.toI32()
    transfer.gasPrice = event.transaction.gasPrice
    transfer.gasUsed = event.receipt ? event.receipt!.gasUsed : null
    transfer.gasLimit = event.transaction.gasLimit
    transfer.blockNumber = event.block.number
    transfer.timestamp = event.block.timestamp

    // Transfer details
    transfer.asset = lendingToken.id
    transfer.pool = pool.id
    transfer.sender = sender.id
    transfer.receiver = receiver.id
    transfer.senderPosition = senderPosition.id
    transfer.receiverPosition = receiverPosition.id
    transfer.shares = event.params.value
    // TODO: Update it to `assets` after deploying latest core contracts
    transfer.amount = event.params.value

    transfer.save()
  }
}
