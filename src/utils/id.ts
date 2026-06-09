// Entity IDs are namespaced by chainId so the same on-chain address (pool, token,
// user) on different chains never collides into one entity. Raw addresses are still
// used for contract registration, effect inputs, and config lookups — only the
// stored entity id / foreign keys are scoped.
export function scopedId(chainId: number, address: string): string {
  return `${chainId}-${address}`
}

export function getEventId(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}-${txHash}-${logIndex}`
}

// userId and poolId are already chain-scoped ids.
export function getPositionId(userId: string, poolId: string): string {
  return `${userId}-${poolId}`
}
