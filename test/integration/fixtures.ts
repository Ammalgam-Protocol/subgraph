// Pinned Sepolia blocks for the current factory
// (0x923739b2bc46bb84bed1f9cb60e9d656917b3e9a, config start_block 12167736).
// Pair USDC-WBTC (0x3e9632...c8dc) was created at block 12167954 (allPairsLength 1).
// Under address_format: lowercase, srcAddress/params come back lowercased, so entity
// ids use that casing.
export const REAL_PAIR = '0x3e9632787bf673f242fe887b8e887fac3991c8dc'

// Genesis: the single block where REAL_PAIR is created (LendingTokensCreated +
// PairCreated fire in the same createPair tx) -> Pool shell + 6 LendingTokens.
export const PAIR_GENESIS = { from: 12167954, to: 12167954 }

// Genesis through the first Swap (12175792) on REAL_PAIR; its first Sync is 12167962.
// The pair contract is registered dynamically (contractRegister ->
// chain.AmmalgamPair.add), so indexing its Sync/Swap here proves the
// dynamic-registration wiring end to end.
export const SWAP_SYNC = { from: 12167954, to: 12175792 }

// Genesis through the first Borrow (borrowX) and Deposit (depositX/depositY) block on the
// dynamically registered lending-token contracts.
export const LENDING_ACTIVITY = { from: 12167954, to: 12175792 }

// Wallet-to-wallet borrowY transfer: block of tx
// 0x4c6c15482225a0706265d80469235a54d1d87b60640cd0fb742df0680bbf30df. Both sides are EOAs
// (eth_getCode empty), neither is the zero address or the pair. Resolved from the tx receipt
// (eth_getTransactionReceipt): the one Transfer log emitted by the borrowY token
// (0x8f5cb4...df95, from LendingTokensCreated).
export const MANUAL_TRANSFER = { from: 12179097, to: 12179097 }

// On-chain details of that transfer, from the Transfer log.
export const MANUAL_TRANSFER_TX = {
  hash: '0x4c6c15482225a0706265d80469235a54d1d87b60640cd0fb742df0680bbf30df',
  logIndex: 445,
  sender: '0x39969480efdd7168d5fb7ac6f8c7897f830cb424',
  receiver: '0xdc58b4d6db58436795c49a1606200c40ec5593cb',
  shares: 10000000n,
}
