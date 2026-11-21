import { describe, expect, it } from 'vitest'

import {
  governanceEventFields,
  lendingEventFields,
  transferEventFields,
} from '../../src/utils/events'
import { getEventId } from '../../src/utils/id'

const event = {
  chainId: 11155111,
  logIndex: 3,
  block: { number: 10, timestamp: 100 },
  transaction: { hash: '0xhash' },
}

describe('lendingEventFields', () => {
  it('builds the shared lending-event header', () => {
    expect(
      lendingEventFields(event, {
        userId: 'u',
        senderId: 's',
        poolId: 'p',
        positionId: 'pos',
        assetId: 'a',
        amount: 100n,
        shares: 90n,
      }),
    ).toEqual({
      id: getEventId(11155111, '0xhash', 3),
      hash: '0xhash',
      logIndex: 3,
      blockNumber: 10n,
      timestamp: 100n,
      user_id: 'u',
      from_id: 's',
      pool_id: 'p',
      position_id: 'pos',
      asset_id: 'a',
      amount: 100n,
      shares: 90n,
    })
  })
})

describe('transferEventFields', () => {
  it('carries independent amount (assets) and shares', () => {
    const fields = transferEventFields(event, {
      senderId: 's',
      receiverId: 'r',
      poolId: 'p',
      senderPositionId: 'sp',
      receiverPositionId: 'rp',
      assetId: 'a',
      amount: 110n,
      shares: 100n,
    })
    expect(fields).toEqual({
      id: getEventId(11155111, '0xhash', 3),
      hash: '0xhash',
      logIndex: 3,
      blockNumber: 10n,
      timestamp: 100n,
      sender_id: 's',
      receiver_id: 'r',
      pool_id: 'p',
      senderPosition_id: 'sp',
      receiverPosition_id: 'rp',
      asset_id: 'a',
      amount: 110n,
      shares: 100n,
    })
    expect(fields.amount).toBe(110n)
    expect(fields.shares).toBe(100n)
  })
})

describe('governanceEventFields', () => {
  it('sets the header, nulls every optional field, then applies the given fields', () => {
    expect(
      governanceEventFields(event, {
        kind: 'RoleGranted',
        contract: '0xcontract',
        fields: { role: '0xrole', account: '0xaccount', sender: '0xsender' },
      }),
    ).toEqual({
      id: getEventId(11155111, '0xhash', 3),
      hash: '0xhash',
      logIndex: 3,
      blockNumber: 10n,
      timestamp: 100n,
      kind: 'RoleGranted',
      contract: '0xcontract',
      operationId: undefined,
      index: undefined,
      target: undefined,
      value: undefined,
      data: undefined,
      predecessor: undefined,
      delay: undefined,
      oldDuration: undefined,
      newDuration: undefined,
      role: '0xrole',
      account: '0xaccount',
      sender: '0xsender',
      implementation: undefined,
      by: undefined,
      newOwner: undefined,
      previousOwner: undefined,
      feeTo: undefined,
      feeToSetter: undefined,
    })
  })
})
