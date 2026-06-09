import { indexer } from 'envio'

import { getChainConfig } from '../utils/chains'
import { BORROW_L, BORROW_X, BORROW_Y, DEPOSIT_L, DEPOSIT_X, DEPOSIT_Y } from '../utils/constants'
import { scopedId } from '../utils/id'
import { ZERO_BD } from '../utils/math'
import { createDefaultPool } from '../utils/pool'
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

// LendingTokensCreated and PairCreated are emitted in the same createPair tx.
// Each LendingToken stores its pool_id, so Pool.lendingTokens is resolved as a
// @derivedFrom reverse lookup (schema.graphql) — no cross-event hand-off or
// module-level state is needed, and the relation works regardless of event order
// because it reads the persisted LendingToken rows, not a same-batch Pool shell.
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

    for (const { address, type: tokenType } of tokenAddresses) {
      // effect input uses the raw on-chain address; entity id/pool_id are scoped.
      const metadata = await context.effect(fetchTokenMetadata, `${event.chainId}:${address}`)
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
    const config = getChainConfig(event.chainId)
    const poolAddress = event.params.pair
    if (config.poolsToSkip.includes(poolAddress.toLowerCase())) return
    const poolId = scopedId(event.chainId, poolAddress)

    const tokenXAddress = event.params.tokenX
    const tokenXId = scopedId(event.chainId, tokenXAddress)
    let tokenX = await context.Token.get(tokenXId)
    if (!tokenX) {
      const metadata = await context.effect(fetchTokenMetadata, `${event.chainId}:${tokenXAddress}`)
      tokenX = {
        id: tokenXId,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        poolCount: 0,
        txCount: 0,
        volume: ZERO_BD,
        whitelistPoolIds: [],
      }
    }

    const tokenYAddress = event.params.tokenY
    const tokenYId = scopedId(event.chainId, tokenYAddress)
    let tokenY = await context.Token.get(tokenYId)
    if (!tokenY) {
      const metadata = await context.effect(fetchTokenMetadata, `${event.chainId}:${tokenYAddress}`)
      tokenY = {
        id: tokenYId,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        poolCount: 0,
        txCount: 0,
        volume: ZERO_BD,
        whitelistPoolIds: [],
      }
    }

    const tokenXWhitelist = [...tokenX.whitelistPoolIds]
    const tokenYWhitelist = [...tokenY.whitelistPoolIds]
    // whitelist config holds raw lowercased addresses; compare against the raw
    // token address, not the (chain-scoped) entity id.
    if (config.whitelistTokens.includes(tokenXAddress.toLowerCase())) tokenYWhitelist.push(poolId)
    if (config.whitelistTokens.includes(tokenYAddress.toLowerCase())) tokenXWhitelist.push(poolId)

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
      tokenXId,
      tokenYId,
      `${tokenX.symbol}-${tokenY.symbol}`,
      BigInt(event.block.timestamp),
      BigInt(event.block.number),
    )

    context.Pool.set(pool)
  },
)
