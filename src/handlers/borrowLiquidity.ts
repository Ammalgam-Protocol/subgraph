import { indexer } from 'envio'

import {
  handleBorrowAction,
  handleLendingTokenTransfer,
  handleRepayAction,
  loadLendingTokenAndPool,
} from './shared'

indexer.onEvent(
  { contract: 'ERC20DebtLiquidity', event: 'BorrowLiquidity' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return

    await handleBorrowAction(context, event, loaded.pool, loaded.lendingToken, event.params.to)
  },
)

indexer.onEvent(
  { contract: 'ERC20DebtLiquidity', event: 'RepayLiquidity' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return

    await handleRepayAction(
      context,
      event,
      loaded.pool,
      loaded.lendingToken,
      event.params.onBehalfOf,
    )
  },
)

indexer.onEvent({ contract: 'ERC20DebtLiquidity', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
