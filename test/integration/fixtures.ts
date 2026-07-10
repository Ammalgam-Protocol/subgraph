// Pinned Sepolia blocks for the current factory
// (0x5a6a9c26587f80ef235903e6de814cb35cf26307, config start_block 11068176).
// Its first PairCreated is at block 11080837. Under address_format: lowercase,
// srcAddress/params come back lowercased, so entity ids use that casing.
export const REAL_PAIR = '0xa3d076dbc0c62845a38706e852b6d66ed9b11235'

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

// Wallet-to-wallet depositX transfer (the spec's motivating gap): block of tx
// 0xee418598861d8ef2db15a0d413187e8ef99a5e2671b8fb42a49f1ee46882a024, resolved by
// querying LendingTokensCreated (factory, topic1 = REAL_PAIR) for REAL_PAIR's depositX
// lending-token address, then its Transfer logs for data == 5_000_000_000.
export const MANUAL_TRANSFER = { from: 11236780, to: 11236780 }

// On-chain details of that transfer, resolved the same way.
export const MANUAL_TRANSFER_TX = {
  hash: '0xee418598861d8ef2db15a0d413187e8ef99a5e2671b8fb42a49f1ee46882a024',
  logIndex: 331,
  sender: '0xdc58b4d6db58436795c49a1606200c40ec5593cb',
  receiver: '0xe82ec34cf62198b70fede5e4b54095b1b5663e33',
  shares: 5_000_000_000n,
}
