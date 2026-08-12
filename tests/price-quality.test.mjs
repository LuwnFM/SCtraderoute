import test from 'node:test'
import assert from 'node:assert/strict'
import { filterCandidatePriceOutliers } from '../scripts/lib/price-quality.mjs'
import { computeRoutes, DEFAULT_FILTERS } from '../public/lib/trade-core.js'

function listing({ source, commodityKey = 'commodity:medical-supplies', locationKey, action, price, quantity = 100, updatedAt = 1 }) {
  return { source, commodityKey, commodityName: 'Medical Supplies', locationKey, action, price, quantity, updatedAt }
}

test('rejects gross exact-source price disagreement', () => {
  const trusted = [listing({ source: 'UEX', locationKey: 'terminal:deltana', action: 'BUYS', price: 5400 })]
  const candidates = [listing({ source: 'SC Trade Tools', locationKey: 'terminal:deltana', action: 'BUYS', price: 95400 })]
  const result = filterCandidatePriceOutliers(candidates, trusted)
  assert.equal(result.accepted.length, 0)
  assert.equal(result.rejected.length, 1)
  assert.equal(result.rejected[0].reason, 'exact-source-disagreement')
})

test('keeps normal exact-source variation', () => {
  const trusted = [listing({ source: 'UEX', locationKey: 'terminal:deltana', action: 'BUYS', price: 5400 })]
  const candidates = [listing({ source: 'SC Trade Tools', locationKey: 'terminal:deltana', action: 'BUYS', price: 5500 })]
  const result = filterCandidatePriceOutliers(candidates, trusted)
  assert.equal(result.accepted.length, 1)
  assert.equal(result.rejected.length, 0)
})

test('rejects SCT-only price far above the trusted commodity range', () => {
  const trusted = [
    listing({ source: 'UEX', commodityKey: 'commodity:scrap', locationKey: 'a', action: 'BUYS', price: 3200 }),
    listing({ source: 'UEX', commodityKey: 'commodity:scrap', locationKey: 'b', action: 'BUYS', price: 3600 }),
    listing({ source: 'UEX', commodityKey: 'commodity:scrap', locationKey: 'c', action: 'BUYS', price: 4600 }),
  ]
  const candidates = [listing({ source: 'SC Trade Tools', commodityKey: 'commodity:scrap', locationKey: 'sct-only', action: 'BUYS', price: 13500 })]
  const result = filterCandidatePriceOutliers(candidates, trusted)
  assert.equal(result.accepted.length, 0)
  assert.equal(result.rejected[0].reason, 'above-trusted-range')
})

test('keeps SCT-only price when trusted coverage is insufficient', () => {
  const trusted = [
    listing({ source: 'UEX', commodityKey: 'commodity:new', locationKey: 'a', action: 'BUYS', price: 100 }),
    listing({ source: 'UEX', commodityKey: 'commodity:new', locationKey: 'b', action: 'BUYS', price: 110 }),
  ]
  const candidates = [listing({ source: 'SC Trade Tools', commodityKey: 'commodity:new', locationKey: 'c', action: 'BUYS', price: 500 })]
  const result = filterCandidatePriceOutliers(candidates, trusted)
  assert.equal(result.accepted.length, 1)
})

test('medical-supplies regression no longer creates multi-million fake profit', () => {
  const trusted = [
    listing({ source: 'UEX', locationKey: 'terminal:mic-l2', action: 'SELLS', price: 3541, quantity: 399 }),
    listing({ source: 'UEX', locationKey: 'terminal:deltana', action: 'BUYS', price: 5400, quantity: 618 }),
  ]
  const candidates = [
    listing({ source: 'SC Trade Tools', locationKey: 'terminal:mic-l2', action: 'SELLS', price: 3541, quantity: 399, updatedAt: 2 }),
    listing({ source: 'SC Trade Tools', locationKey: 'terminal:deltana', action: 'BUYS', price: 95400, quantity: 89, updatedAt: 2 }),
  ]
  const quality = filterCandidatePriceOutliers(candidates, trusted)
  const snapshot = {
    commodities: [{ key: 'commodity:medical-supplies', name: 'Medical Supplies', isIllegal: false }],
    terminals: [
      { key: 'terminal:mic-l2', name: 'MIC-L2', system: 'Stanton', location: 'microTech' },
      { key: 'terminal:deltana', name: 'Rayari Deltana', system: 'Stanton', location: 'microTech' },
    ],
    listings: [...trusted, ...quality.accepted],
    ships: [], jumpPoints: [], distances: [],
  }
  const routes = computeRoutes(snapshot, { ...DEFAULT_FILTERS, capacity: 4, budget: 1_000_000, requireKnownAvailability: true })
  assert.equal(routes.length, 1)
  assert.equal(routes[0].buyPrice, 3541)
  assert.equal(routes[0].sellPrice, 5400)
  assert.equal(routes[0].units, 4)
  assert.equal(routes[0].profit, 7436)
})
