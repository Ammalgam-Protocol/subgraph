// Entity IDs are namespaced by chainId so the same address on two chains never collides
// into one entity. Only stored ids and `_id` foreign keys are scoped; contract
// registration, effect inputs and config lookups still use the raw address.
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
