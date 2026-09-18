import { createTestIndexer } from 'envio'
import { describe, expect, it } from 'vitest'

import { scopedId } from '../../src/utils/id'
import { LENDING_ACTIVITY, REAL_PAIR } from './fixtures'

const HAS_TOKEN = !!process.env.ENVIO_API_TOKEN
const CHAIN_ID = 11155111
const REAL_PAIR_ID = scopedId(CHAIN_ID, REAL_PAIR)

// Every column the daily fee-accounting query returns, so a rename in either place fails this test.
const FEES_FOR_DAY_COLUMNS = [
  'swapFeesTokenX',
  'swapFeesTokenY',
  'grossInterestTokenX',
  'grossInterestTokenY',
  'grossInterestTokenLAsX',
  'grossInterestTokenLAsY',
  'protocolInterestTokenX',
  'protocolInterestTokenY',
  'protocolInterestTokenLAsX',
  'protocolInterestTokenLAsY',
  'protocolFeesTokenX',
  'protocolFeesTokenY',
  'protocolFeesTokenLAsX',
  'protocolFeesTokenLAsY',
  'penaltiesTokenLAsX',
  'penaltiesTokenLAsY',
] as const

describe.skipIf(!HAS_TOKEN)('Sepolia FeesForDay query', () => {
  it('returns non-null rows for REAL_PAIR with every named column and the per-leg identities holding', async () => {
    const indexer = createTestIndexer()
    await indexer.process({
      chains: { [CHAIN_ID]: { startBlock: LENDING_ACTIVITY.from, endBlock: LENDING_ACTIVITY.to } },
    })

    const days = (await indexer.PoolDayData.getAll()).filter((d) => d.pool_id === REAL_PAIR_ID)
    expect(days.length).toBeGreaterThan(0)

    for (const { date } of days) {
      // TestIndexer only exposes get/getOrThrow/getAll/set (no getWhere/HTTP layer), so the
      // where:{date:{_eq:$date}} filter is simulated with an in-memory filter over the full set.
      const daysForDate = (await indexer.PoolDayData.getAll()).filter((d) => d.date === date)
      const dayData = daysForDate.find((d) => d.pool_id === REAL_PAIR_ID)
      expect(dayData).toBeDefined()
      if (!dayData) continue

      // pool { id tokenX { id } tokenY { id } } resolves
      const pool = await indexer.Pool.getOrThrow(dayData.pool_id)
      expect(pool.tokenX_id).not.toBe('')
      expect(pool.tokenY_id).not.toBe('')

      for (const column of FEES_FOR_DAY_COLUMNS) {
        expect(typeof dayData[column]).toBe('bigint')
      }

      for (const leg of ['X', 'Y'] as const) {
        const protocolRevenue =
          dayData[`protocolFeesToken${leg}`] + dayData[`protocolFeesTokenLAs${leg}`]
        const borrowerFees =
          protocolRevenue -
          (dayData[`protocolInterestToken${leg}`] + dayData[`protocolInterestTokenLAs${leg}`])
        const dailyFees =
          dayData[`swapFeesToken${leg}`] +
          dayData[`grossInterestToken${leg}`] +
          dayData[`grossInterestTokenLAs${leg}`] +
          borrowerFees +
          dayData[`penaltiesTokenLAs${leg}`]
        const supplySideRevenue = dailyFees - protocolRevenue

        expect(dailyFees >= protocolRevenue).toBe(true)
        expect(supplySideRevenue >= 0n).toBe(true)
        expect(dayData[`protocolInterestToken${leg}`] <= dayData[`protocolFeesToken${leg}`]).toBe(
          true,
        )
        expect(
          dayData[`protocolInterestTokenLAs${leg}`] <= dayData[`protocolFeesTokenLAs${leg}`],
        ).toBe(true)
      }

      expect(date % 86400).toBe(0)
    }
  }, 120_000)
})
