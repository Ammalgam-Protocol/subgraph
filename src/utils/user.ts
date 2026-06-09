export function createDefaultUser(id: string) {
  return {
    id,
    positionCount: 0,
    swapCount: 0,
    liquidationCount: 0,
    depositCount: 0,
    withdrawCount: 0,
    borrowCount: 0,
    repayCount: 0,
    transferredCount: 0,
    receivedCount: 0,
  }
}
