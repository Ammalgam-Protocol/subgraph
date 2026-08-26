// Pinned Sepolia blocks for the current factory
// (0xbf3367206d684fbf4b27b56624a64d4933ee111d, config start_block 11185304).
// It creates 4 pairs across blocks 11389961-11389965; these fixtures track the first.
// Under address_format: lowercase, srcAddress/params come back lowercased, so entity
// ids use that casing.
export const REAL_PAIR = '0x004ef27fd8713e7284b0ada3af00695b9d46550a'

// Genesis: the single block where REAL_PAIR is created (LendingTokensCreated +
// PairCreated fire in the same createPair tx) -> Pool shell + 6 LendingTokens.
export const PAIR_GENESIS = { from: 11389961, to: 11389961 }

// Genesis through the first Swap (11438502) / Sync (11389976) activity on REAL_PAIR.
// The pair contract is registered dynamically (contractRegister ->
// chain.AmmalgamPair.add), so indexing its Sync/Swap here proves the
// dynamic-registration wiring end to end.
export const SWAP_SYNC = { from: 11389961, to: 11438502 }

// Genesis through the first Borrow/Deposit block on the dynamically registered
// lending-token contracts.
export const LENDING_ACTIVITY = { from: 11389961, to: 11438509 }

// Wallet-to-wallet borrowY transfer (the spec's motivating gap): block of tx
// 0x2e69f38ebcfa9fee7388f10de361af4c54340db79974142b60b54dd904d005b7, resolved by
// querying LendingTokensCreated (factory, topic1 = REAL_PAIR) for REAL_PAIR's lending-token
// addresses, then their Transfer logs for one where neither side is the zero address.
export const MANUAL_TRANSFER = { from: 11438509, to: 11438509 }

// On-chain details of that transfer, resolved the same way.
export const MANUAL_TRANSFER_TX = {
  hash: '0x2e69f38ebcfa9fee7388f10de361af4c54340db79974142b60b54dd904d005b7',
  logIndex: 218,
  sender: '0x6b0a5398ef03e11d2f71b1a16b097ad076129d46',
  receiver: '0x39969480efdd7168d5fb7ac6f8c7897f830cb424',
  shares: 186093000n,
}

// Same window as SWAP_SYNC: the bootstrap mint that seeds referenceReserveX/Y lands in it, and
// its Sync carries the observation. Needs an archive ENVIO_RPC_URL_11155111: the reference is
// read with eth_call at a historical block.
export const REFERENCE_RESERVE_ACTIVITY = SWAP_SYNC
