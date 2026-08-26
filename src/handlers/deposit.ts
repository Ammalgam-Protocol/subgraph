import { indexer } from 'envio'

import {
  handleDepositAction,
  handleLendingTokenTransfer,
  handleWithdrawAction,
  loadLendingTokenAndPool,
} from './shared'

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Deposit' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return

  await handleDepositAction(context, event, loaded.pool, loaded.lendingToken, event.params.owner)
})

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Withdraw' }, async ({ event, context }) => {
  const loaded = await loadLendingTokenAndPool(context, event)
  if (!loaded) return

  await handleWithdrawAction(
    context,
    event,
    loaded.pool,
    loaded.lendingToken,
    event.params.receiver,
  )
})

indexer.onEvent({ contract: 'ERC4626Deposit', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
