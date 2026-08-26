import type { EvmOnEventContext } from 'envio'
import { indexer } from 'envio'

import { isWhitelisted, shouldSkipPool } from '../utils/chains'
import { BORROW_L, BORROW_X, BORROW_Y, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y } from '../utils/constants'
import { scopedId } from '../utils/id'
import { createDefaultPool } from '../utils/pool'
import { createDefaultToken } from '../utils/token'
import { fetchTokenMetadata } from '../utils/tokenEffects'

// LendingTokensCreated fires before PairCreated in the createPair tx.
indexer.contractRegister(
  { contract: 'AmmalgamFactory', event: 'LendingTokensCreated' },
  async ({ event, context }) => {
    context.chain.ERC4626Deposit.add(event.params.depositX)
    context.chain.ERC4626Deposit.add(event.params.depositY)
    context.chain.ERC20DepositLiquidity.add(event.params.depositL)
    context.chain.ERC4626Debt.add(event.params.borrowX)
    context.chain.ERC4626Debt.add(event.params.borrowY)
    context.chain.ERC20DebtLiquidity.add(event.params.borrowL)
  },
)

indexer.contractRegister(
  { contract: 'AmmalgamFactory', event: 'PairCreated' },
  async ({ event, context }) => {
    context.chain.AmmalgamPair.add(event.params.pair)
  },
)

async function getOrCreateToken(context: EvmOnEventContext, chainId: number, address: string) {
  const id = scopedId(chainId, address)
  const existing = await context.Token.get(id)
  if (existing) return existing
  const metadata = await context.effect(fetchTokenMetadata, `${chainId}:${address}`)
  return createDefaultToken(id, metadata)
}

// Pool.lendingTokens is a @derivedFrom reverse lookup off LendingToken.pool_id, so no
// cross-event hand-off or module-level state is needed: it reads persisted LendingToken
// rows, not a same-batch Pool shell, and holds regardless of event order.
indexer.onEvent(
  { contract: 'AmmalgamFactory', event: 'LendingTokensCreated' },
  async ({ event, context }) => {
    const pairId = scopedId(event.chainId, event.params.pair)
    const tokenAddresses = [
      { address: event.params.depositL, type: DEPOSIT_L },
      { address: event.params.depositX, type: DEPOSIT_X },
      { address: event.params.depositY, type: DEPOSIT_Y },
      { address: event.params.borrowL, type: BORROW_L },
      { address: event.params.borrowX, type: BORROW_X },
      { address: event.params.borrowY, type: BORROW_Y },
    ]

    // The six reads are independent, and the preload run warms the effect cache for the second pass.
    const resolved = await Promise.all(
      tokenAddresses.map(async ({ address, type }) => ({
        address,
        type,
        metadata: await context.effect(fetchTokenMetadata, `${event.chainId}:${address}`),
      })),
    )

    for (const { address, type: tokenType, metadata } of resolved) {
      context.LendingToken.set({
        id: scopedId(event.chainId, address),
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        pool_id: pairId,
        tokenType,
      })
    }
  },
)

indexer.onEvent(
  { contract: 'AmmalgamFactory', event: 'PairCreated' },
  async ({ event, context }) => {
    const poolAddress = event.params.pair
    if (shouldSkipPool(event.chainId, poolAddress)) return
    const poolId = scopedId(event.chainId, poolAddress)

    const tokenXAddress = event.params.tokenX
    const tokenYAddress = event.params.tokenY

    const [tokenX, tokenY] = await Promise.all([
      getOrCreateToken(context, event.chainId, tokenXAddress),
      getOrCreateToken(context, event.chainId, tokenYAddress),
    ])

    const tokenXWhitelist = [...tokenX.whitelistPoolIds]
    const tokenYWhitelist = [...tokenY.whitelistPoolIds]
    // whitelist config holds raw lowercased addresses; compare against the raw
    // token address, not the (chain-scoped) entity id.
    if (isWhitelisted(event.chainId, tokenXAddress)) tokenYWhitelist.push(poolId)
    if (isWhitelisted(event.chainId, tokenYAddress)) tokenXWhitelist.push(poolId)

    context.Token.set({
      ...tokenX,
      poolCount: tokenX.poolCount + 1,
      whitelistPoolIds: tokenXWhitelist,
    })
    context.Token.set({
      ...tokenY,
      poolCount: tokenY.poolCount + 1,
      whitelistPoolIds: tokenYWhitelist,
    })

    const pool = createDefaultPool(
      poolId,
      scopedId(event.chainId, tokenXAddress),
      scopedId(event.chainId, tokenYAddress),
      `${tokenX.symbol}-${tokenY.symbol}`,
      BigInt(event.block.timestamp),
      BigInt(event.block.number),
    )

    context.Pool.set(pool)
  },
)
