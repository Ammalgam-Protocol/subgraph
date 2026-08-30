import { indexer } from 'envio'

import {
  handleBorrowAction,
  handleLendingTokenTransfer,
  handleRepayAction,
  loadLendingTokenAndPool,
} from './shared'

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Borrow' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return

  await handleBorrowAction(context, event, loaded.pool, loaded.lendingToken, event.params.to)
})

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Repay' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return

  await handleRepayAction(context, event, loaded.pool, loaded.lendingToken, event.params.onBehalfOf)
})

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
