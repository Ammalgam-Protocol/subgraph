import type { Position } from 'envio'

import { addAt } from './array'
import { BORROW_L, DEFAULT_LENDING_ASSETS, DEFAULT_TOKEN_BALANCES, ZERO_BI } from './constants'
import { getPositionId } from './id'

export function createDefaultPosition(
  userId: string,
  poolId: string,
  hash: string,
  blockNumber: bigint,
  timestamp: bigint,
) {
  return {
    id: getPositionId(userId, poolId),
    user_id: userId,
    pool_id: poolId,
    hash,
    blockNumber,
    timestamp,
    assets: [...DEFAULT_TOKEN_BALANCES],
    shares: [...DEFAULT_TOKEN_BALANCES],
    principal: ZERO_BI,
    depositCount: 0,
    withdrawCount: 0,
    borrowCount: 0,
    repayCount: 0,
    transferredCount: 0,
    receivedCount: 0,
    pendingTxHash: undefined,
    pendingSeizedAssets: undefined,
    pendingRepaidAssets: undefined,
    pendingBadDebtAssets: undefined,
  }
}

export type PendingField = 'pendingSeizedAssets' | 'pendingRepaidAssets' | 'pendingBadDebtAssets'

export type LendingAssets = [bigint, bigint, bigint]

export function getLendingTokenIndex(tokenType: number): number {
  return tokenType >= BORROW_L ? tokenType - BORROW_L : tokenType
}

export function addPendingFields(
  position: Position,
  txHash: string,
  field: PendingField,
  index: number,
  amount: bigint,
): Position {
  const fresh = position.pendingTxHash !== txHash
  const base = {
    pendingSeizedAssets: fresh
      ? [...DEFAULT_LENDING_ASSETS]
      : (position.pendingSeizedAssets ?? [...DEFAULT_LENDING_ASSETS]),
    pendingRepaidAssets: fresh
      ? [...DEFAULT_LENDING_ASSETS]
      : (position.pendingRepaidAssets ?? [...DEFAULT_LENDING_ASSETS]),
    pendingBadDebtAssets: fresh
      ? [...DEFAULT_LENDING_ASSETS]
      : (position.pendingBadDebtAssets ?? [...DEFAULT_LENDING_ASSETS]),
  }
  const added = addAt(base[field], amount, index).map((value) => (value < 0n ? 0n : value))
  return { ...position, pendingTxHash: txHash, ...base, [field]: added }
}

export function getPendingFields(position: Position | undefined, txHash: string) {
  const stash = position?.pendingTxHash === txHash ? position : undefined
  return {
    seized: (stash?.pendingSeizedAssets ?? [...DEFAULT_LENDING_ASSETS]) as LendingAssets,
    repaid: (stash?.pendingRepaidAssets ?? [...DEFAULT_LENDING_ASSETS]) as LendingAssets,
    badDebt: (stash?.pendingBadDebtAssets ?? [...DEFAULT_LENDING_ASSETS]) as LendingAssets,
  }
}

export function clearPendingFields(position: Position): Position {
  return {
    ...position,
    pendingSeizedAssets: [...DEFAULT_LENDING_ASSETS],
    pendingRepaidAssets: [...DEFAULT_LENDING_ASSETS],
    pendingBadDebtAssets: [...DEFAULT_LENDING_ASSETS],
  }
}
