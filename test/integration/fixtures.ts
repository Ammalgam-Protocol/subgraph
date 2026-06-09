// Pinned, finalized Sepolia blocks discovered via HyperSync against the current
// factory (0x63EE90aaD8cf482e2618C9df6280353A56440079, config start_block 10249390).
// Its first PairCreated is at block 10280037. Addresses from real chain data are
// checksummed; entity ids preserve that casing.
export const REAL_PAIR = '0xa5CE6BB7F7C5b526F4d426Ab1ff7c9C19F857d24'

// Genesis: the single block where REAL_PAIR is created (LendingTokensCreated +
// PairCreated fire in the same createPair tx) -> Pool shell + 6 LendingTokens.
export const PAIR_GENESIS = { from: 10280037, to: 10280037 }

// Genesis through the first Swap (10280149) / Sync (10280037) activity on REAL_PAIR.
// The pair contract is registered dynamically (contractRegister ->
// chain.AmmalgamPair.add), so indexing its Sync/Swap here proves the
// dynamic-registration wiring end to end.
export const SWAP_SYNC = { from: 10280037, to: 10280200 }

// Same range covers early Deposit/Withdraw/Borrow/Repay on the dynamically
// registered lending-token contracts.
export const LENDING_ACTIVITY = { from: 10280037, to: 10280200 }
