import { indexer } from 'envio'

import { lendingEventFields } from '../utils/events'
import { handleLendingAction, handleLendingTokenTransfer, loadLendingTokenAndPool } from './shared'

// Mint = Deposit Liquidity
indexer.onEvent(
  { contract: 'ERC20DepositLiquidity', event: 'Mint' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return
    const { lendingToken, pool } = loaded

    const { userId, senderId, positionId } = await handleLendingAction(context, event, pool, {
      recipient: event.params.to,
      sender: event.params.sender,
      action: 'deposit',
    })

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
  },
)

// Burn = Withdraw Liquidity
indexer.onEvent(
  { contract: 'ERC20DepositLiquidity', event: 'Burn' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return
    const { lendingToken, pool } = loaded

    const { userId, senderId, positionId } = await handleLendingAction(context, event, pool, {
      recipient: event.params.to,
      sender: event.params.sender,
      action: 'withdraw',
    })

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
  },
)

indexer.onEvent({ contract: 'ERC20DepositLiquidity', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
