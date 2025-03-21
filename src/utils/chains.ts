// ref: https://github.com/Uniswap/v4-subgraph/blob/main/src/utils/chains.ts
import { Address, dataSource } from '@graphprotocol/graph-ts'

import { INT_EIGHT, INT_EIGHTTEEN, INT_SIX } from './constants'
import { NativeTokenDetails } from './nativeTokenDetails'
import { StaticTokenDefinition } from './staticTokenDefinition'

// assemblyscript does not support string enums, hence these constants
const SEPOLIA_NETWORK_NAME = 'sepolia'
const MONAD_TESTNET_NETWORK_NAME = 'monad-testnet'
const ARBITRUM_SEPOLIA_NETWORK_NAME = 'arbitrum-sepolia'
const ARBITRUM_ONE_NETWORK_NAME = 'arbitrum-one'
const MAINNET_NETWORK_NAME = 'mainnet'

// Note: All token and pool addresses should be lowercased!
export class SubgraphConfig {
  // Ammalgam Peripheral contract addresses in lowercase
  // @dev: Peripheral contracts can be upgraded, hence the list of addresses
  peripheralAddresses: string[]

  // the address of a token that tracks the price of the native token, most of
  // the time, this is a wrapped asset but could also be the native token itself
  // for some chains
  wrappedNativeAddress: string

  // list of stablecoin addresses
  stablecoinAddresses: string[]

  // a token must be in a pool with one of these tokens in order to derive a
  // price (in addition to passing the minimumEthLocked check). This is also
  // used to determine whether volume is tracked or not.
  whitelistTokens: string[]

  // token overrides are used to override RPC calls for the symbol, name, and
  // decimals for tokens. for new chains this is typically empty.
  tokenOverrides: StaticTokenDefinition[]

  // skip the creation of these pools in handlePairCreated. for new chains this is typically empty.
  poolsToSkip: string[]

  // native token details for the chain.
  nativeTokenDetails: NativeTokenDetails
}

export function getSubgraphConfig(): SubgraphConfig {
  // Update this value to the corresponding chain you want to deploy
  const selectedNetwork = dataSource.network()

  if (selectedNetwork == SEPOLIA_NETWORK_NAME) {
    return {
      peripheralAddresses: [
        '0x65dfbe3f4ebaee887d0188fb42c674cf6087b0fe', // old
        '0xc93d3f8b640db4e0a9ab84a2b073f41db0478f31', // latest
      ],
      wrappedNativeAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
      stablecoinAddresses: [
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT,
        '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: INT_EIGHTTEEN,
      },
    }
  } else if (selectedNetwork == MONAD_TESTNET_NETWORK_NAME) {
    return {
      peripheralAddresses: [
        '0xaba9457bf3670a1bf5843efc4b0b6ad48747f3e8', // old
        '0xa284a7cae12f6b71161c98d1c830abe9877cfb2e', // latest
      ],
      wrappedNativeAddress: '0x760afe86e5de5fa0ee542fc7b7b713e1c5425701', // WMON
      stablecoinAddresses: [
        '0xf817257fed379853cde0fa4f97ab987181b1e5ea', // USDC
        '0x88b8e2161dedc77ef4ab7585569d2415a1c1055d', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native MON
        '0xf817257fed379853cde0fa4f97ab987181b1e5ea', // USDC
        '0x88b8e2161dedc77ef4ab7585569d2415a1c1055d', // USDT,
        '0x760afe86e5de5fa0ee542fc7b7b713e1c5425701', // WMON
        '0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37', // WETH
        '0xcf5a6076cfa32686c0df13abada2b40dec133f1d', // WBTC
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0xf817257fed379853cde0fa4f97ab987181b1e5ea'),
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: INT_SIX,
        },
        {
          address: Address.fromString('0x88b8e2161dedc77ef4ab7585569d2415a1c1055d'),
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: INT_SIX,
        },
        {
          address: Address.fromString('0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37'),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: INT_EIGHTTEEN,
        },
        {
          address: Address.fromString('0x760afe86e5de5fa0ee542fc7b7b713e1c5425701'),
          symbol: 'WMON',
          name: 'Wrapped Monad',
          decimals: INT_EIGHTTEEN,
        },
        {
          address: Address.fromString('0xcf5a6076cfa32686c0df13abada2b40dec133f1d'),
          symbol: 'WBTC',
          name: 'Wrapped Bitcoin',
          decimals: INT_EIGHT,
        },
      ],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'MON',
        name: 'Monad',
        decimals: INT_EIGHTTEEN,
      },
    }
  } else if (selectedNetwork == ARBITRUM_SEPOLIA_NETWORK_NAME) {
    return {
      peripheralAddresses: [],
      wrappedNativeAddress: '0x980b62da83eff3d4576c647993b0c1d7faf17c73', // WETH
      stablecoinAddresses: [
        '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC
        '0x980b62da83eff3d4576c647993b0c1d7faf17c73', // WETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: INT_EIGHTTEEN,
      },
    }
  } else if (selectedNetwork == ARBITRUM_ONE_NETWORK_NAME) {
    return {
      peripheralAddresses: [],
      wrappedNativeAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
      stablecoinAddresses: [
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
      ],
      whitelistTokens: [
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: INT_EIGHTTEEN,
        },
        {
          address: Address.fromString('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'),
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: INT_SIX,
        },
      ],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: INT_EIGHTTEEN,
      },
    }
  } else if (selectedNetwork == MAINNET_NETWORK_NAME) {
    return {
      peripheralAddresses: [],
      wrappedNativeAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      stablecoinAddresses: [
        '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      ],
      whitelistTokens: [
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
        '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
        '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
        '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
        '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', // SNX
        '0x111111111117dc0aa78b770fa6a738034120c302', // 1INCH
        '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
        '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
        '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: INT_EIGHTTEEN,
      },
    }
  } else {
    throw new Error('Unsupported Network')
  }
}
