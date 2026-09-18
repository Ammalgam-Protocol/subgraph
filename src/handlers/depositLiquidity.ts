import { indexer } from 'envio'

import {
  handleDepositAction,
  handleLendingTokenTransfer,
  handleWithdrawAction,
  loadLendingTokenAndPool,
} from './shared'

indexer.onEvent(
  { contract: 'ERC20DepositLiquidity', event: 'Mint' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return

    await handleDepositAction(context, event, loaded.pool, loaded.lendingToken, event.params.to)
  },
)

indexer.onEvent(
  { contract: 'ERC20DepositLiquidity', event: 'Burn' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return

    await handleWithdrawAction(context, event, loaded.pool, loaded.lendingToken, event.params.to)
  },
)

indexer.onEvent({ contract: 'ERC20DepositLiquidity', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
