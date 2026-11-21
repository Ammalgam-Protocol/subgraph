import { indexer } from 'envio'

import { governanceEventFields } from '../utils/events'

indexer.onEvent({ contract: 'AmmalgamFactory', event: 'NewFeeTo' }, async ({ event, context }) => {
  context.GovernanceEvent.set(
    governanceEventFields(event, {
      kind: 'NewFeeTo',
      contract: event.srcAddress,
      fields: { feeTo: event.params.feeTo },
    }),
  )
})

indexer.onEvent(
  { contract: 'AmmalgamFactory', event: 'NewFeeToSetter' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'NewFeeToSetter',
        contract: event.srcAddress,
        fields: { feeToSetter: event.params.feeToSetter },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'TimelockController', event: 'CallScheduled' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'CallScheduled',
        contract: event.srcAddress,
        fields: {
          operationId: event.params.id,
          index: event.params.index,
          target: event.params.target,
          value: event.params.value,
          data: event.params.data,
          predecessor: event.params.predecessor,
          delay: event.params.delay,
        },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'TimelockController', event: 'CallExecuted' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'CallExecuted',
        contract: event.srcAddress,
        fields: {
          operationId: event.params.id,
          index: event.params.index,
          target: event.params.target,
          value: event.params.value,
          data: event.params.data,
        },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'TimelockController', event: 'MinDelayChange' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'MinDelayChange',
        contract: event.srcAddress,
        fields: { oldDuration: event.params.oldDuration, newDuration: event.params.newDuration },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'TimelockController', event: 'Cancelled' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'Cancelled',
        contract: event.srcAddress,
        fields: { operationId: event.params.id },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'TimelockController', event: 'RoleGranted' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'RoleGranted',
        contract: event.srcAddress,
        fields: {
          role: event.params.role,
          account: event.params.account,
          sender: event.params.sender,
        },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'TimelockController', event: 'RoleRevoked' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'RoleRevoked',
        contract: event.srcAddress,
        fields: {
          role: event.params.role,
          account: event.params.account,
          sender: event.params.sender,
        },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'BeaconController', event: 'RoleGranted' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'RoleGranted',
        contract: event.srcAddress,
        fields: {
          role: event.params.role,
          account: event.params.account,
          sender: event.params.sender,
        },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'BeaconController', event: 'RoleRevoked' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'RoleRevoked',
        contract: event.srcAddress,
        fields: {
          role: event.params.role,
          account: event.params.account,
          sender: event.params.sender,
        },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'BeaconController', event: 'AllowedAdded' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'AllowedAdded',
        contract: event.srcAddress,
        fields: { implementation: event.params.implementation, by: event.params.by },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'BeaconController', event: 'AllowedRemoved' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'AllowedRemoved',
        contract: event.srcAddress,
        fields: { implementation: event.params.implementation, by: event.params.by },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'UpgradeableBeacon', event: 'Upgraded' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'Upgraded',
        contract: event.srcAddress,
        fields: { implementation: event.params.implementation },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'SaturationAndGeometricTWAPState', event: 'Upgraded' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'Upgraded',
        contract: event.srcAddress,
        fields: { implementation: event.params.implementation },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'SaturationAndGeometricTWAPState', event: 'OwnershipTransferred' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'OwnershipTransferred',
        contract: event.srcAddress,
        fields: { previousOwner: event.params.previousOwner, newOwner: event.params.newOwner },
      }),
    )
  },
)

indexer.onEvent(
  { contract: 'ProxyAdmin', event: 'OwnershipTransferred' },
  async ({ event, context }) => {
    context.GovernanceEvent.set(
      governanceEventFields(event, {
        kind: 'OwnershipTransferred',
        contract: event.srcAddress,
        fields: { previousOwner: event.params.previousOwner, newOwner: event.params.newOwner },
      }),
    )
  },
)
