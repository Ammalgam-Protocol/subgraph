import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { testBlockNumber } from './testBlock'

const FACTORY = '0x923739b2bc46bb84bed1f9cb60e9d656917b3e9a'
const SEPOLIA_TIMELOCK = '0x6dc59cd3536a6ba3201885d7afde8709cdc1b617'
const SEPOLIA_BEACON_CONTROLLER = '0x1c1690127847a8f4a8e699167e46b0f7068eb5a7'
const SEPOLIA_BEACON = '0x61b2345745e65dea5bfc7e003a6c9005b06b2a3f'
const SEPOLIA_TWAP_PROXY = '0x3942056802031419f73f3e9ae5a8960f8a20b87b'
const SEPOLIA_PROXY_ADMIN = '0x5a8dc641c92162fc91a5d8255617e0067e430fc1'

const OPERATION_ID = '0x1111111111111111111111111111111111111111111111111111111111111111'
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'
const ROLE = '0x2222222222222222222222222222222222222222222222222222222222222222'
const TARGET = '0xaa01000000000000000000000000000000000001'
const ACCOUNT = '0xc0de000000000000000000000000000000000001'
const SENDER = '0x5e4d000000000000000000000000000000000001'
const IMPLEMENTATION = '0x1111000000000000000000000000000000000001'
const OWNER_A = '0xa0a0000000000000000000000000000000000001'
const OWNER_B = '0xb0b0000000000000000000000000000000000002'
const FEE_TO = '0xfee0000000000000000000000000000000000001'
const FEE_TO_SETTER = '0xfee5000000000000000000000000000000000002'

describe('governance handlers (factory kinds)', () => {
  it('NewFeeTo stores kind, contract and feeTo', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamFactory',
              event: 'NewFeeTo',
              srcAddress: FACTORY,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xfeeto' },
              params: { feeTo: FEE_TO },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xfeeto-3')).toEqual({
      id: '11155111-0xfeeto-3',
      kind: 'NewFeeTo',
      contract: FACTORY,
      hash: '0xfeeto',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      feeTo: FEE_TO,
    })
  })

  it('NewFeeToSetter stores kind, contract and feeToSetter', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'AmmalgamFactory',
              event: 'NewFeeToSetter',
              srcAddress: FACTORY,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xfeetosetter' },
              params: { feeToSetter: FEE_TO_SETTER },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xfeetosetter-3')).toEqual({
      id: '11155111-0xfeetosetter-3',
      kind: 'NewFeeToSetter',
      contract: FACTORY,
      hash: '0xfeetosetter',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      feeToSetter: FEE_TO_SETTER,
    })
  })
})

// These kinds route through the governance contracts configured on Sepolia in config.yaml.
describe('governance handlers (timelock, beacon, proxy kinds)', () => {
  it('CallScheduled stores the operation fields', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'TimelockController',
              event: 'CallScheduled',
              srcAddress: SEPOLIA_TIMELOCK,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xcallscheduled' },
              params: {
                id: OPERATION_ID,
                index: 0n,
                target: TARGET,
                value: 0n,
                data: '0x',
                predecessor: ZERO_HASH,
                delay: 604800n,
              },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xcallscheduled-3')).toEqual({
      id: '11155111-0xcallscheduled-3',
      kind: 'CallScheduled',
      contract: SEPOLIA_TIMELOCK,
      hash: '0xcallscheduled',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      operationId: OPERATION_ID,
      index: 0n,
      target: TARGET,
      value: 0n,
      data: '0x',
      predecessor: ZERO_HASH,
      delay: 604800n,
    })
  })

  it('CallExecuted stores the operation fields', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'TimelockController',
              event: 'CallExecuted',
              srcAddress: SEPOLIA_TIMELOCK,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xcallexecuted' },
              params: {
                id: OPERATION_ID,
                index: 1n,
                target: TARGET,
                value: 5n,
                data: '0xdeadbeef',
              },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xcallexecuted-3')).toEqual({
      id: '11155111-0xcallexecuted-3',
      kind: 'CallExecuted',
      contract: SEPOLIA_TIMELOCK,
      hash: '0xcallexecuted',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      operationId: OPERATION_ID,
      index: 1n,
      target: TARGET,
      value: 5n,
      data: '0xdeadbeef',
    })
  })

  it('MinDelayChange stores both durations unchanged when the delay decreases', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'TimelockController',
              event: 'MinDelayChange',
              srcAddress: SEPOLIA_TIMELOCK,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xmindelay' },
              params: { oldDuration: 604800n, newDuration: 86400n },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xmindelay-3')).toEqual({
      id: '11155111-0xmindelay-3',
      kind: 'MinDelayChange',
      contract: SEPOLIA_TIMELOCK,
      hash: '0xmindelay',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      oldDuration: 604800n,
      newDuration: 86400n,
    })
  })

  it('Cancelled stores the operation id', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'TimelockController',
              event: 'Cancelled',
              srcAddress: SEPOLIA_TIMELOCK,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xcancelled' },
              params: { id: OPERATION_ID },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xcancelled-3')).toEqual({
      id: '11155111-0xcancelled-3',
      kind: 'Cancelled',
      contract: SEPOLIA_TIMELOCK,
      hash: '0xcancelled',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      operationId: OPERATION_ID,
    })
  })

  it('RoleGranted from the timelock and from the BeaconController differ in contract', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'TimelockController',
              event: 'RoleGranted',
              srcAddress: SEPOLIA_TIMELOCK,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xrolegranted' },
              params: { role: ROLE, account: ACCOUNT, sender: SENDER },
            },
            {
              contract: 'BeaconController',
              event: 'RoleGranted',
              srcAddress: SEPOLIA_BEACON_CONTROLLER,
              logIndex: 4,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xrolegranted' },
              params: { role: ROLE, account: ACCOUNT, sender: SENDER },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xrolegranted-3')).toEqual({
      id: '11155111-0xrolegranted-3',
      kind: 'RoleGranted',
      contract: SEPOLIA_TIMELOCK,
      hash: '0xrolegranted',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      role: ROLE,
      account: ACCOUNT,
      sender: SENDER,
    })
    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xrolegranted-4')).toEqual({
      id: '11155111-0xrolegranted-4',
      kind: 'RoleGranted',
      contract: SEPOLIA_BEACON_CONTROLLER,
      hash: '0xrolegranted',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 4,
      timestamp: 1000n,
      role: ROLE,
      account: ACCOUNT,
      sender: SENDER,
    })
  })

  it('RoleRevoked stores role, account and sender', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'BeaconController',
              event: 'RoleRevoked',
              srcAddress: SEPOLIA_BEACON_CONTROLLER,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xrolerevoked' },
              params: { role: ROLE, account: ACCOUNT, sender: SENDER },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xrolerevoked-3')).toEqual({
      id: '11155111-0xrolerevoked-3',
      kind: 'RoleRevoked',
      contract: SEPOLIA_BEACON_CONTROLLER,
      hash: '0xrolerevoked',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      role: ROLE,
      account: ACCOUNT,
      sender: SENDER,
    })
  })

  it('AllowedAdded stores implementation and by', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'BeaconController',
              event: 'AllowedAdded',
              srcAddress: SEPOLIA_BEACON_CONTROLLER,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xallowedadded' },
              params: { implementation: IMPLEMENTATION, by: SENDER },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xallowedadded-3')).toEqual({
      id: '11155111-0xallowedadded-3',
      kind: 'AllowedAdded',
      contract: SEPOLIA_BEACON_CONTROLLER,
      hash: '0xallowedadded',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      implementation: IMPLEMENTATION,
      by: SENDER,
    })
  })

  it('AllowedRemoved stores implementation and by', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'BeaconController',
              event: 'AllowedRemoved',
              srcAddress: SEPOLIA_BEACON_CONTROLLER,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xallowedremoved' },
              params: { implementation: IMPLEMENTATION, by: SENDER },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xallowedremoved-3')).toEqual({
      id: '11155111-0xallowedremoved-3',
      kind: 'AllowedRemoved',
      contract: SEPOLIA_BEACON_CONTROLLER,
      hash: '0xallowedremoved',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      implementation: IMPLEMENTATION,
      by: SENDER,
    })
  })

  it('Upgraded on the beacon stores the implementation and the emitting contract', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'UpgradeableBeacon',
              event: 'Upgraded',
              srcAddress: SEPOLIA_BEACON,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xupgradedbeacon' },
              params: { implementation: IMPLEMENTATION },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xupgradedbeacon-3')).toEqual({
      id: '11155111-0xupgradedbeacon-3',
      kind: 'Upgraded',
      contract: SEPOLIA_BEACON,
      hash: '0xupgradedbeacon',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      implementation: IMPLEMENTATION,
    })
  })

  it('Upgraded on the TWAP proxy stores the implementation and the emitting contract', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'SaturationAndGeometricTWAPState',
              event: 'Upgraded',
              srcAddress: SEPOLIA_TWAP_PROXY,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xupgradedtwap' },
              params: { implementation: IMPLEMENTATION },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xupgradedtwap-3')).toEqual({
      id: '11155111-0xupgradedtwap-3',
      kind: 'Upgraded',
      contract: SEPOLIA_TWAP_PROXY,
      hash: '0xupgradedtwap',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      implementation: IMPLEMENTATION,
    })
  })

  it('OwnershipTransferred from the TWAP proxy and from the ProxyAdmin differ in contract', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: 'SaturationAndGeometricTWAPState',
              event: 'OwnershipTransferred',
              srcAddress: SEPOLIA_TWAP_PROXY,
              logIndex: 3,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xownership' },
              params: { previousOwner: ADDRESS_ZERO, newOwner: OWNER_A },
            },
            {
              contract: 'ProxyAdmin',
              event: 'OwnershipTransferred',
              srcAddress: SEPOLIA_PROXY_ADMIN,
              logIndex: 4,
              block: { number: testBlockNumber(10), timestamp: 1000 },
              transaction: { hash: '0xownership' },
              params: { previousOwner: OWNER_A, newOwner: OWNER_B },
            },
          ],
        },
      },
    })

    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xownership-3')).toEqual({
      id: '11155111-0xownership-3',
      kind: 'OwnershipTransferred',
      contract: SEPOLIA_TWAP_PROXY,
      hash: '0xownership',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 3,
      timestamp: 1000n,
      previousOwner: ADDRESS_ZERO,
      newOwner: OWNER_A,
    })
    expect(await indexer.GovernanceEvent.getOrThrow('11155111-0xownership-4')).toEqual({
      id: '11155111-0xownership-4',
      kind: 'OwnershipTransferred',
      contract: SEPOLIA_PROXY_ADMIN,
      hash: '0xownership',
      blockNumber: BigInt(testBlockNumber(10)),
      logIndex: 4,
      timestamp: 1000n,
      previousOwner: OWNER_A,
      newOwner: OWNER_B,
    })
  })
})
