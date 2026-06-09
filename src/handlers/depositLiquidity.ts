import { indexer } from 'envio'

import { resolveBeneficiary } from '../utils/chains'
import { lendingEventFields } from '../utils/events'
import { scopedId } from '../utils/id'
import {
  applyAssetDelta,
  ensureSender,
  getOrCreatePosition,
  handleLendingTokenTransfer,
  loadLendingTokenAndPool,
} from './shared'

// Mint = Deposit Liquidity
indexer.onEvent(
  { contract: 'ERC20DepositLiquidity', event: 'Mint' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return
    const { lendingToken, pool } = loaded

    const tokenType = lendingToken.tokenType
    // Mint attributes to `to` directly — no peripheral rewrite.
    const userId = scopedId(event.chainId, event.params.to)
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
      principal: event.params.assets,
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
  },
)

// Burn = Withdraw Liquidity
indexer.onEvent(
  { contract: 'ERC20DepositLiquidity', event: 'Burn' },
  async ({ event, context }) => {
    const loaded = await loadLendingTokenAndPool(context, event)
    if (!loaded) return
    const { lendingToken, pool } = loaded

    const tokenType = lendingToken.tokenType
    const userId = scopedId(
      event.chainId,
      resolveBeneficiary(event.chainId, event.params.to, event.transaction.from!),
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
      principal: -event.params.assets,
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
  },
)

indexer.onEvent({ contract: 'ERC20DepositLiquidity', event: 'Transfer' }, ({ event, context }) =>
  handleLendingTokenTransfer(event, context),
)
