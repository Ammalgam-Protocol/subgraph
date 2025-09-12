import { Address, log } from '@graphprotocol/graph-ts'

import { PairCreated as PairCreatedEvent } from '../types/AmmalgamFactory/AmmalgamFactory'
import { Token } from '../types/schema'
import {
  AmmalgamPair as PoolTemplate,
  ERC4626Debt as BorrowTemplate,
  ERC4626Deposit as DepositTemplate,
  ERC20DebtLiquidity as BorrowLiquidityTemplate,
  ERC20DepositLiquidity as DepositLiquidityTemplate,
} from '../types/templates'

import { parseLendingTokens } from '../utils'
import { SubgraphConfig, getSubgraphConfig } from '../utils/chains'
import {
  BORROW_L,
  BORROW_X,
  BORROW_Y,
  DEPOSIT_L,
  DEPOSIT_X,
  DEPOSIT_Y,
  BIGDECIMAL_ZERO,
  INT_ZERO,
  INT_ONE,
} from '../utils/constants'
import { createLendingToken, createPool } from '../utils/pool'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol } from '../utils/token'

const LENDING_TOKENS_CREATED_TOPIC =
  '0xb15f210cfca75579c1238a305f2f8d7ead2cf10aa8c5b5a33bad8911e60279ed'

export function handlePairCreated(event: PairCreatedEvent): void {
  handlePairCreatedHelper(event)
}

export function handlePairCreatedHelper(
  event: PairCreatedEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const whitelistTokens = subgraphConfig.whitelistTokens
  const tokenOverrides = subgraphConfig.tokenOverrides
  const poolsToSkip = subgraphConfig.poolsToSkip
  const nativeTokenDetails = subgraphConfig.nativeTokenDetails
  const poolAddress = event.params.pair

  if (poolsToSkip.includes(poolAddress.toHexString())) {
    return
  }

  const pool = createPool(poolAddress)
  let tokenX = Token.load(event.params.tokenX.toHexString())
  let tokenY = Token.load(event.params.tokenY.toHexString())

  // fetch info if null
  if (tokenX === null) {
    tokenX = new Token(event.params.tokenX.toHexString())
    tokenX.symbol = fetchTokenSymbol(event.params.tokenX, tokenOverrides, nativeTokenDetails)
    tokenX.name = fetchTokenName(event.params.tokenX, tokenOverrides, nativeTokenDetails)
    const decimals = fetchTokenDecimals(event.params.tokenX, tokenOverrides, nativeTokenDetails)

    // bail if we couldn't figure out the decimals
    if (decimals === INT_ZERO) {
      log.critical('Invalid decimals on tokenX: {}', [event.params.tokenX.toHexString()])
    }

    tokenX.decimals = decimals
    tokenX.poolCount = INT_ZERO
    tokenX.txCount = INT_ZERO
    tokenX.volume = BIGDECIMAL_ZERO
    tokenX.whitelistPools = []
  }

  if (tokenY === null) {
    tokenY = new Token(event.params.tokenY.toHexString())
    tokenY.symbol = fetchTokenSymbol(event.params.tokenY, tokenOverrides, nativeTokenDetails)
    tokenY.name = fetchTokenName(event.params.tokenY, tokenOverrides, nativeTokenDetails)
    const decimals = fetchTokenDecimals(event.params.tokenY, tokenOverrides, nativeTokenDetails)

    if (decimals === INT_ZERO) {
      log.critical('Invalid decimals on tokenY: {}', [event.params.tokenY.toHexString()])
    }

    tokenY.decimals = decimals
    tokenY.poolCount = INT_ZERO
    tokenY.txCount = INT_ZERO
    tokenY.volume = BIGDECIMAL_ZERO
    tokenY.whitelistPools = []
  }

  // increase pool count for `tokenX` and `tokenY`
  tokenX.poolCount += INT_ONE
  tokenY.poolCount += INT_ONE

  // update white listed pools
  if (whitelistTokens.includes(tokenX.id)) {
    const newPools = tokenY.whitelistPools
    newPools.push(pool.id)
    tokenY.whitelistPools = newPools
  }
  if (whitelistTokens.includes(tokenY.id)) {
    const newPools = tokenX.whitelistPools
    newPools.push(pool.id)
    tokenX.whitelistPools = newPools
  }

  pool.tokenX = tokenX.id
  pool.tokenY = tokenY.id
  pool.name = `${tokenX.symbol}-${tokenY.symbol}`

  pool.createdAtTimestamp = event.block.timestamp
  pool.createdAtBlockNumber = event.block.number

  pool.save()
  tokenX.save()
  tokenY.save()

  let lendingTokens: Address[] = []
  if (event.receipt !== null) {
    const eventLogs = event.receipt!.logs
    for (let i = 0; i < eventLogs.length; i++) {
      const eventLog = eventLogs[i]
      for (let j = 0; j < eventLog.topics.length; j++) {
        if (eventLog.topics[j].toHexString() == LENDING_TOKENS_CREATED_TOPIC) {
          lendingTokens = parseLendingTokens(eventLog.data.toHexString())
        }
      }
    }
  } else {
    log.critical('No lending tokens created for pool: {}', [poolAddress.toHexString()])
  }

  // Set `lendingTokens` after saving the `pool` and underlying tokens
  const depositLToken = createLendingToken(
    poolAddress,
    lendingTokens[DEPOSIT_L],
    DEPOSIT_L,
    nativeTokenDetails,
  )
  const depositXToken = createLendingToken(
    poolAddress,
    lendingTokens[DEPOSIT_X],
    DEPOSIT_X,
    nativeTokenDetails,
  )
  const depositYToken = createLendingToken(
    poolAddress,
    lendingTokens[DEPOSIT_Y],
    DEPOSIT_Y,
    nativeTokenDetails,
  )
  const borrowLToken = createLendingToken(
    poolAddress,
    lendingTokens[BORROW_L],
    BORROW_L,
    nativeTokenDetails,
  )
  const borrowXToken = createLendingToken(
    poolAddress,
    lendingTokens[BORROW_X],
    BORROW_X,
    nativeTokenDetails,
  )
  const borrowYToken = createLendingToken(
    poolAddress,
    lendingTokens[BORROW_Y],
    BORROW_Y,
    nativeTokenDetails,
  )

  pool.lendingTokens = [
    depositLToken.id,
    depositXToken.id,
    depositYToken.id,
    borrowLToken.id,
    borrowXToken.id,
    borrowYToken.id,
  ]
  pool.save()

  // Create a new instance of the `AmmalgamPair` template
  PoolTemplate.create(poolAddress)

  // Create a new instance of the `ERC4626Deposit` template
  DepositTemplate.create(Address.fromString(depositXToken.id))
  DepositTemplate.create(Address.fromString(depositYToken.id))

  // Create a new instance of the `ERC20DepositLiquidity` template
  DepositLiquidityTemplate.create(Address.fromString(depositLToken.id))

  // Create a new instance of the `ERC4626Debt` template
  BorrowTemplate.create(Address.fromString(borrowXToken.id))
  BorrowTemplate.create(Address.fromString(borrowYToken.id))

  // Create a new instance of the `ERC20DebtLiquidity` template
  BorrowLiquidityTemplate.create(Address.fromString(borrowLToken.id))
}
