import { describe, expect, it } from 'vitest'

import { lendingEventFields, transferEventFields } from '../../src/utils/events'
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
  it('sets amount and shares both to the transferred value', () => {
    expect(
      transferEventFields(event, 250n, {
        senderId: 's',
        receiverId: 'r',
        poolId: 'p',
        senderPositionId: 'sp',
        receiverPositionId: 'rp',
        assetId: 'a',
      }),
    ).toEqual({
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
      amount: 250n,
      shares: 250n,
    })
  })
})
