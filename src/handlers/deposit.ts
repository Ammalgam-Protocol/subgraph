import { indexer } from 'envio'

import { addAt, subtractAt } from '../utils/array'
import { getChainConfig } from '../utils/chains'
import {
  ADDRESS_ZERO,
  BORROW_L,
  DEPOSIT_L,
  DEPOSIT_X,
  DEPOSIT_Y,
  ZERO_BI,
} from '../utils/constants'
import { getEventId, getPositionId, scopedId } from '../utils/id'
import { convertXToL, convertYToL } from '../utils/math'
import { createDefaultPosition } from '../utils/position'
import { createDefaultUser } from '../utils/user'

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Deposit' }, async ({ event, context }) => {
  const lendingToken = await context.LendingToken.get(scopedId(event.chainId, event.srcAddress))
  if (!lendingToken) return

  const pool = await context.Pool.get(lendingToken.pool_id)
  if (!pool) return

  const tokenType = lendingToken.tokenType
  const userId = scopedId(event.chainId, event.params.owner)

  // Get or create user
  let user = await context.User.get(userId)
  if (!user) user = createDefaultUser(userId)

  // Get or create position
  const positionId = getPositionId(userId, pool.id)
  let position = await context.Position.get(positionId)
  let newPositionCount = 0
  if (!position) {
    position = createDefaultPosition(
      userId,
      pool.id,
      event.transaction.hash,
      BigInt(event.block.number),
      BigInt(event.block.timestamp),
    )
    user = { ...user, positionCount: user.positionCount + 1 }
    newPositionCount = 1
  }

  // Update pool totals
  const updatedPool = {
    ...pool,
    positionCount: pool.positionCount + newPositionCount,
    totalAssets: addAt(pool.totalAssets, event.params.assets, tokenType),
    totalShares: addAt(pool.totalShares, event.params.shares, tokenType),
    depositCount: pool.depositCount + 1,
    txCount: pool.txCount + 1,
  }

  // Update position
  const updatedPosition = {
    ...position,
    assets: addAt(position.assets, event.params.assets, tokenType),
    shares: addAt(position.shares, event.params.shares, tokenType),
    depositCount: position.depositCount + 1,
  }

  // Calculate principal adjustment
  const activeLiquidity = updatedPool.totalAssets[DEPOSIT_L] - updatedPool.totalAssets[BORROW_L]
  let principal = ZERO_BI
  if (tokenType === DEPOSIT_X) {
    principal = convertXToL(event.params.assets, pool.reserveX, activeLiquidity)
  } else if (tokenType === DEPOSIT_Y) {
    principal = convertYToL(event.params.assets, pool.reserveY, activeLiquidity)
  }
  updatedPosition.principal = position.principal + principal

  context.Pool.set(updatedPool)
  context.Position.set(updatedPosition)
  context.User.set({ ...user, depositCount: user.depositCount + 1 })

  // Get or create sender user
  const senderId = scopedId(event.chainId, event.params.sender)
  let sender = await context.User.get(senderId)
  if (!sender) {
    sender = createDefaultUser(senderId)
    context.User.set(sender)
  }

  context.Deposit.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    user_id: userId,
    from_id: senderId,
    pool_id: pool.id,
    position_id: positionId,
    asset_id: lendingToken.id,
    amount: event.params.assets,
    shares: event.params.shares,
  })
})

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Withdraw' }, async ({ event, context }) => {
  const lendingToken = await context.LendingToken.get(scopedId(event.chainId, event.srcAddress))
  if (!lendingToken) return

  const pool = await context.Pool.get(lendingToken.pool_id)
  if (!pool) return

  const config = getChainConfig(event.chainId)
  const tokenType = lendingToken.tokenType

  const senderId = scopedId(event.chainId, event.params.sender)
  let sender = await context.User.get(senderId)
  if (!sender) {
    sender = createDefaultUser(senderId)
    context.User.set(sender)
  }

  // Peripheral check: if receiver is peripheral, use tx.from as user
  let userAddress: string
  if (config.peripheralAddresses.includes(event.params.receiver.toLowerCase())) {
    userAddress = event.transaction.from!
  } else {
    userAddress = event.params.receiver
  }
  const userId = scopedId(event.chainId, userAddress)

  let user = await context.User.get(userId)
  if (!user) user = createDefaultUser(userId)

  const positionId = getPositionId(userId, pool.id)
  let position = await context.Position.get(positionId)
  let newPositionCount = 0
  if (!position) {
    position = createDefaultPosition(
      userId,
      pool.id,
      event.transaction.hash,
      BigInt(event.block.number),
      BigInt(event.block.timestamp),
    )
    user = { ...user, positionCount: user.positionCount + 1 }
    newPositionCount = 1
  }

  // Update pool totals (subtract for withdraw)
  const updatedPool = {
    ...pool,
    positionCount: pool.positionCount + newPositionCount,
    totalAssets: subtractAt(pool.totalAssets, event.params.assets, tokenType),
    totalShares: subtractAt(pool.totalShares, event.params.shares, tokenType),
    withdrawCount: pool.withdrawCount + 1,
    txCount: pool.txCount + 1,
  }

  // Update position
  const updatedPosition = {
    ...position,
    assets: subtractAt(position.assets, event.params.assets, tokenType),
    shares: subtractAt(position.shares, event.params.shares, tokenType),
    withdrawCount: position.withdrawCount + 1,
  }

  // Calculate principal adjustment
  const activeLiquidity = updatedPool.totalAssets[DEPOSIT_L] - updatedPool.totalAssets[BORROW_L]
  let principal = ZERO_BI
  if (tokenType === DEPOSIT_X) {
    principal = convertXToL(event.params.assets, pool.reserveX, activeLiquidity)
  } else if (tokenType === DEPOSIT_Y) {
    principal = convertYToL(event.params.assets, pool.reserveY, activeLiquidity)
  }
  updatedPosition.principal = position.principal - principal

  context.Pool.set(updatedPool)
  context.Position.set(updatedPosition)
  context.User.set({ ...user, withdrawCount: user.withdrawCount + 1 })

  context.Withdraw.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    user_id: userId,
    from_id: senderId,
    pool_id: pool.id,
    position_id: positionId,
    asset_id: lendingToken.id,
    amount: event.params.assets,
    shares: event.params.shares,
  })
})

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Transfer' }, async ({ event, context }) => {
  const config = getChainConfig(event.chainId)

  // Build ignored addresses list
  const ignoredAddresses = [ADDRESS_ZERO, ...config.peripheralAddresses]

  if (
    ignoredAddresses.includes(event.params.from.toLowerCase()) ||
    ignoredAddresses.includes(event.params.to.toLowerCase()) ||
    event.params.value === 0n
  ) {
    return
  }

  const lendingToken = await context.LendingToken.get(scopedId(event.chainId, event.srcAddress))
  if (!lendingToken) return

  const pool = await context.Pool.get(lendingToken.pool_id)
  if (!pool) return

  const senderId = scopedId(event.chainId, event.params.from)
  const receiverId = scopedId(event.chainId, event.params.to)

  // Skip transfers to/from the pool contract itself (both sides chain-scoped).
  if (
    senderId.toLowerCase() === pool.id.toLowerCase() ||
    receiverId.toLowerCase() === pool.id.toLowerCase()
  ) {
    return
  }

  const tokenType = lendingToken.tokenType

  // Load sender and position
  let sender = await context.User.get(senderId)
  if (!sender) {
    sender = createDefaultUser(senderId)
  }

  const senderPositionId = getPositionId(senderId, pool.id)
  const senderPosition = await context.Position.get(senderPositionId)
  if (!senderPosition) return

  // Update sender position
  const updatedSenderPosition = {
    ...senderPosition,
    assets: subtractAt(senderPosition.assets, event.params.value, tokenType),
    shares: subtractAt(senderPosition.shares, event.params.value, tokenType),
    transferredCount: senderPosition.transferredCount + 1,
  }

  // Load receiver and position
  let receiver = await context.User.get(receiverId)
  if (!receiver) receiver = createDefaultUser(receiverId)

  const receiverPositionId = getPositionId(receiverId, pool.id)
  let receiverPosition = await context.Position.get(receiverPositionId)
  let newPositionCount = 0
  if (!receiverPosition) {
    receiverPosition = createDefaultPosition(
      receiverId,
      pool.id,
      event.transaction.hash,
      BigInt(event.block.number),
      BigInt(event.block.timestamp),
    )
    receiver = { ...receiver, positionCount: receiver.positionCount + 1 }
    newPositionCount = 1
  }

  // Update receiver position
  const updatedReceiverPosition = {
    ...receiverPosition,
    assets: addAt(receiverPosition.assets, event.params.value, tokenType),
    shares: addAt(receiverPosition.shares, event.params.value, tokenType),
    receivedCount: receiverPosition.receivedCount + 1,
  }

  // Update counts
  context.Pool.set({
    ...pool,
    positionCount: pool.positionCount + newPositionCount,
    transferCount: pool.transferCount + 1,
    txCount: pool.txCount + 1,
  })
  context.Position.set(updatedSenderPosition)
  context.Position.set(updatedReceiverPosition)
  context.User.set({ ...sender, transferredCount: sender.transferredCount + 1 })
  context.User.set({ ...receiver, receivedCount: receiver.receivedCount + 1 })

  context.Transfer.set({
    id: getEventId(event.chainId, event.transaction.hash, event.logIndex),
    hash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    sender_id: senderId,
    receiver_id: receiverId,
    pool_id: pool.id,
    senderPosition_id: senderPositionId,
    receiverPosition_id: receiverPositionId,
    asset_id: lendingToken.id,
    amount: event.params.value,
    shares: event.params.value,
  })
})
