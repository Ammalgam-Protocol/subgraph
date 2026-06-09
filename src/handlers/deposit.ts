import { indexer } from 'envio'

import { resolveBeneficiary } from '../utils/chains'
import { lendingEventFields } from '../utils/events'
import { scopedId } from '../utils/id'
import { principalDelta } from '../utils/math'
import {
  applyAssetDelta,
  ensureSender,
  getOrCreatePosition,
  handleLendingTokenTransfer,
  loadLendingTokenAndPool,
} from './shared'

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Deposit' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  const tokenType = lendingToken.tokenType
  // Deposit attributes to `owner` directly — no peripheral rewrite.
  const userId = scopedId(event.chainId, event.params.owner)
  const { user, position, positionId, newPositions } = await getOrCreatePosition(
    context,
    userId,
    pool,
    event,
  )

  applyAssetDelta(context, {
    pool,
    position,
    user,
    newPositions,
    tokenType,
    assets: event.params.assets,
    shares: event.params.shares,
    sign: 1,
    counter: 'deposit',
    principal: principalDelta(tokenType, event.params.assets, pool),
  })

  const senderId = scopedId(event.chainId, event.params.sender)
  await ensureSender(context, senderId)

  context.Deposit.set(
    lendingEventFields(event, {
      userId,
      senderId,
      poolId: pool.id,
      positionId,
      assetId: lendingToken.id,
      amount: event.params.assets,
      shares: event.params.shares,
    }),
  )
})

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Withdraw' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  const tokenType = lendingToken.tokenType
  const userId = scopedId(
    event.chainId,
    resolveBeneficiary(event.chainId, event.params.receiver, event.transaction.from!),
  )
  const { user, position, positionId, newPositions } = await getOrCreatePosition(
    context,
    userId,
    pool,
    event,
  )

  applyAssetDelta(context, {
    pool,
    position,
    user,
    newPositions,
    tokenType,
    assets: event.params.assets,
    shares: event.params.shares,
    sign: -1,
    counter: 'withdraw',
    principal: -principalDelta(tokenType, event.params.assets, pool),
  })

  const senderId = scopedId(event.chainId, event.params.sender)
  await ensureSender(context, senderId)

  context.Withdraw.set(
    lendingEventFields(event, {
      userId,
      senderId,
      poolId: pool.id,
      positionId,
      assetId: lendingToken.id,
      amount: event.params.assets,
      shares: event.params.shares,
    }),
  )
})

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
