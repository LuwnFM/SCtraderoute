import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTravelTime, formatTravelDuration, isLikelyGroundTerminal } from '../src/lib/travel-time.js'

test('travel ETA is unavailable without distance', () => {
  assert.equal(estimateTravelTime({ distanceGm: null, profit: 1000 }), null)
})

test('orbital ETA follows distance baseline', () => {
  const result = estimateTravelTime({ distanceGm: 81, profit: 829725, from: { name: 'Nyx Gateway (Stanton)' }, to: { name: 'Everus Harbor' }, path: { jumpCount: 0 } })
  assert.ok(result)
  assert.ok(Math.abs(result.totalSeconds - 354) <= 2)
  assert.ok(result.profitPerMinute > 100000)
})

test('ground endpoint adds approach/departure overhead', () => {
  assert.equal(isLikelyGroundTerminal({ name: 'ArcCorp 045', location: 'ArcCorp Mining Area 045 · Wala' }), true)
  assert.equal(isLikelyGroundTerminal({ name: 'Stanton Gateway (Pyro)' }), false)
  const result = estimateTravelTime({ distanceGm: 17, profit: 10000, from: { name: 'ArcCorp 045', location: 'ArcCorp Mining Area 045 · Wala' }, to: { name: 'Stanton Gateway (Pyro)' }, path: { jumpCount: 0 } })
  assert.ok(result)
  assert.ok(result.totalSeconds >= 145 && result.totalSeconds <= 155)
})

test('jump count is represented as explicit beta overhead', () => {
  const same = estimateTravelTime({ distanceGm: 50, profit: 1000, from: {}, to: {}, path: { jumpCount: 0 } })
  const jump = estimateTravelTime({ distanceGm: 50, profit: 1000, from: {}, to: {}, path: { jumpCount: 1 } })
  assert.equal(jump.totalSeconds - same.totalSeconds, 90)
})

test('duration formatter is readable', () => {
  assert.equal(formatTravelDuration(354), '5 мин 54 с')
  assert.equal(formatTravelDuration(3720), '1 ч 2 мин')
})
