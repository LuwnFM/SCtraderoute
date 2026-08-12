import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTravelTime, formatTravelDuration, isLikelyGroundTerminal } from '../src/lib/travel-time.js'

test('travel ETA is unavailable without distance', () => {
  assert.equal(estimateTravelTime({ distanceGm: null, profit: 1000 }), null)
})

test('ETA beta matches supplied UEX distance/ETA examples', () => {
  const samples = [
    [23, 199],
    [81, 699],
    [92, 794],
    [130, 1123],
    [151, 1304],
    [17, 147],
  ]
  for (const [distanceGm, expectedSeconds] of samples) {
    const result = estimateTravelTime({ distanceGm, profit: 1000, from: {}, to: {}, path: { jumpCount: 0 } })
    assert.ok(result)
    assert.ok(Math.abs(result.totalSeconds - expectedSeconds) <= 1, `${distanceGm} Gm => ${result.totalSeconds}s, expected ~${expectedSeconds}s`)
  }
})

test('profit per minute is derived from beta ETA', () => {
  const result = estimateTravelTime({ distanceGm: 81, profit: 829725, from: { name: 'Nyx Gateway (Stanton)' }, to: { name: 'Everus Harbor' }, path: { jumpCount: 0 } })
  assert.ok(result)
  assert.equal(result.totalSeconds, 699)
  assert.ok(result.profitPerMinute > 71000 && result.profitPerMinute < 71300)
})

test('terminal classifier remains metadata only in beta v2', () => {
  assert.equal(isLikelyGroundTerminal({ name: 'ArcCorp 045', location: 'ArcCorp Mining Area 045 · Wala' }), true)
  assert.equal(isLikelyGroundTerminal({ name: 'Stanton Gateway (Pyro)' }), false)
  const ground = estimateTravelTime({ distanceGm: 17, profit: 10000, from: { name: 'ArcCorp 045', location: 'ArcCorp Mining Area 045 · Wala' }, to: { name: 'Stanton Gateway (Pyro)' }, path: { jumpCount: 0 } })
  const orbital = estimateTravelTime({ distanceGm: 17, profit: 10000, from: {}, to: {}, path: { jumpCount: 0 } })
  assert.equal(ground.totalSeconds, orbital.totalSeconds)
})

test('jump metadata does not invent undocumented overhead', () => {
  const same = estimateTravelTime({ distanceGm: 50, profit: 1000, from: {}, to: {}, path: { jumpCount: 0 } })
  const jump = estimateTravelTime({ distanceGm: 50, profit: 1000, from: {}, to: {}, path: { jumpCount: 1 } })
  assert.equal(jump.totalSeconds, same.totalSeconds)
  assert.equal(jump.jumpCount, 1)
})

test('duration formatter is readable', () => {
  assert.equal(formatTravelDuration(699), '11 мин 39 с')
  assert.equal(formatTravelDuration(3720), '1 ч 2 мин')
})
