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

indexer.onEvent({ contract: 'ERC4626Debt', event: 'Borrow' }, async ({ event, context }) => {
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
    sign: 1,
    counter: 'borrow',
    // Borrow adds to totals but subtracts principal (0n for BORROW_X/Y — preserves the quirk).
    principal: -principalDelta(tokenType, event.params.assets, pool),
  })

  const senderId = scopedId(event.chainId, event.params.sender)
  await ensureSender(context, senderId)

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

  const tokenType = lendingToken.tokenType
  const userId = scopedId(
    event.chainId,
    resolveBeneficiary(event.chainId, event.params.onBehalfOf, event.transaction.from!),
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
    counter: 'repay',
    // Repay subtracts from totals but adds principal (0n for BORROW_X/Y).
    principal: principalDelta(tokenType, event.params.assets, pool),
  })

  const senderId = scopedId(event.chainId, event.params.sender)
  await ensureSender(context, senderId)

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
