import { indexer } from 'envio'

import { lendingEventFields } from '../utils/events'
import { handleLendingAction, handleLendingTokenTransfer, loadLendingTokenAndPool } from './shared'

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Borrow' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  const { userId, senderId, positionId } = await handleLendingAction(context, event, pool, {
    recipient: event.params.to,
    sender: event.params.sender,
    action: 'borrow',
  })

  context.Borrow.set(
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

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Repay' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return
  const { lendingToken, pool } = loaded

  const { userId, senderId, positionId } = await handleLendingAction(context, event, pool, {
    recipient: event.params.onBehalfOf,
    sender: event.params.sender,
    action: 'repay',
  })

  context.Repay.set(
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

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
