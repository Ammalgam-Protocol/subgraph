// Pinned Sepolia blocks for the current factory
// (0x5a6A9C26587F80eF235903e6de814cB35CF26307, config start_block 11068176).
// Its first PairCreated is at block 11080837. Addresses from real chain data are
// checksummed; entity ids preserve that casing.
export const REAL_PAIR = '0xa3d076DbC0C62845A38706E852b6D66Ed9B11235'

// Genesis: the single block where REAL_PAIR is created (LendingTokensCreated +
// PairCreated fire in the same createPair tx) -> Pool shell + 6 LendingTokens.
export const PAIR_GENESIS = { from: 11080837, to: 11080837 }

// Genesis through the first Swap (11086667) / Sync (11085713) activity on REAL_PAIR.
// The pair contract is registered dynamically (contractRegister ->
// chain.AmmalgamPair.add), so indexing its Sync/Swap here proves the
// dynamic-registration wiring end to end.
export const SWAP_SYNC = { from: 11080837, to: 11086667 }

// Same range covers early Deposit/Withdraw/Borrow/Repay on the dynamically
// registered lending-token contracts.
export const LENDING_ACTIVITY = { from: 11080837, to: 11086667 }
