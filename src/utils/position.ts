import { DEFAULT_TOKEN_BALANCES, ZERO_BI } from './constants'
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
  }
}
