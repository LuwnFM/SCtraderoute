import test from 'node:test'
import assert from 'node:assert/strict'
import { cacheEntryNeedsRefresh, compactHistoryRows, historyKey, historyPoints } from '../scripts/lib/history-cache.mjs'

test('history key rejects invalid identifiers', () => {
  assert.equal(historyKey(81, 60), '81:60')
  assert.equal(historyKey(0, 60), '')
})

test('history compaction keeps only real UEX price points and deduplicates timestamps', () => {
  const rows = compactHistoryRows([
    { date_added: 10, price_buy: 100, price_sell: 0 },
    { date_added: 10, price_buy: 110, price_sell: 0 },
    { date_added: 20, price_buy: 0, price_sell: 150 },
    { date_added: 0, price_buy: 999, price_sell: 999 },
  ])
  assert.deepEqual(rows, [[10, 110, 0], [20, 0, 150]])
})

test('history points select requested side', () => {
  const entry = { rows: [[10, 110, 0], [20, 120, 150], [30, 0, 160]] }
  assert.deepEqual(historyPoints(entry, 'buy'), [{ t: 10, v: 110, kind: 'buy' }, { t: 20, v: 120, kind: 'buy' }])
  assert.deepEqual(historyPoints(entry, 'sell'), [{ t: 20, v: 150, kind: 'sell' }, { t: 30, v: 160, kind: 'sell' }])
})

test('history refresh TTL is deterministic', () => {
  const now = Date.parse('2026-08-12T18:00:00Z')
  assert.equal(cacheEntryNeedsRefresh({ fetchedAt: '2026-08-12T06:00:00Z', rows: [] }, now, 48), false)
  assert.equal(cacheEntryNeedsRefresh({ fetchedAt: '2026-08-09T06:00:00Z', rows: [] }, now, 48), true)
})
