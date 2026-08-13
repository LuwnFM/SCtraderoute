import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTravelTime, formatTravelDuration, formatTravelDurationRange, isLikelyGroundTerminal } from '../src/lib/travel-time.js'

const stockShip = {
  name: 'Test Freighter',
  quantumDrive: {
    source: 'StarCitizenWiki/scunpacked',
    sourceVersion: '4.8.2-LIVE.test',
    driveName: 'Test QD',
    travelTime10GmSeconds: 56,
    spoolUpTimeSeconds: 6,
    calibrationDelaySeconds: 1.5,
    cooldownTimeSeconds: 22.86,
    quantumSpeedMps: 324_000_000,
    fuelConsumptionScuPerGm: 0.02,
  },
}

test('travel ETA is unavailable without distance', () => {
  assert.equal(estimateTravelTime({ distanceGm: null, profit: 1000 }), null)
})

test('fallback ETA retains supplied UEX distance calibration', () => {
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
    assert.equal(result.isGameData, false)
    assert.equal(result.hasTravelRange, false)
    assert.ok(Math.abs(result.totalSeconds - expectedSeconds) <= 1, `${distanceGm} Gm => ${result.totalSeconds}s, expected ~${expectedSeconds}s`)
  }
})

test('selected ship uses TravelTime10GM plus spool and calibration from game data', () => {
  const result = estimateTravelTime({ distanceGm: 20, profit: 100_000, from: {}, to: {}, path: { jumpCount: 0 } }, { ship: stockShip })
  assert.ok(result)
  assert.equal(result.isGameData, true)
  assert.equal(result.cruiseSeconds, 112)
  assert.equal(result.spoolSeconds, 6)
  assert.equal(result.calibrationSeconds, 1.5)
  assert.equal(result.cooldownSeconds, 22.86)
  assert.equal(result.totalSeconds, 120)
  assert.equal(result.totalSecondsMin, 120)
  assert.equal(result.totalSecondsMax, 120)
  assert.equal(result.driveName, 'Test QD')
  assert.equal(result.sourceVersion, '4.8.2-LIVE.test')
})

test('cooldown is reported but not included in minimum arrival ETA', () => {
  const result = estimateTravelTime({ distanceGm: 10, profit: 1000, from: {}, to: {}, path: { jumpCount: 0 } }, { ship: stockShip })
  assert.ok(result)
  assert.equal(result.totalSeconds, 64)
  assert.equal(Math.round(result.cruiseSeconds + result.spoolSeconds + result.calibrationSeconds), 64)
  assert.ok(result.cooldownSeconds > 20)
})

test('profit per minute from game data is an upper bound because route overhead remains unknown', () => {
  const result = estimateTravelTime({ distanceGm: 20, profit: 100_000, from: {}, to: {}, path: { jumpCount: 0 } }, { ship: stockShip })
  assert.ok(result)
  assert.equal(result.totalSeconds, 120)
  assert.equal(result.profitPerMinute, 50_000)
  assert.equal(result.profitPerMinuteMin, 50_000)
  assert.equal(result.profitPerMinuteMax, 50_000)
  assert.equal(result.isLowerBound, true)
  assert.ok(result.unknownSegments.includes('погрузка/разгрузка'))
})

test('terminal classifier remains metadata only until documented route overhead exists', () => {
  assert.equal(isLikelyGroundTerminal({ name: 'ArcCorp 045', location: 'ArcCorp Mining Area 045 · Wala' }), true)
  assert.equal(isLikelyGroundTerminal({ name: 'Stanton Gateway (Pyro)' }), false)
  const ground = estimateTravelTime({ distanceGm: 17, profit: 10000, from: { name: 'ArcCorp 045', location: 'ArcCorp Mining Area 045 · Wala' }, to: { name: 'Stanton Gateway (Pyro)' }, path: { jumpCount: 0 } })
  const orbital = estimateTravelTime({ distanceGm: 17, profit: 10000, from: {}, to: {}, path: { jumpCount: 0 } })
  assert.equal(ground.totalSeconds, orbital.totalSeconds)
})

test('one live jump adds a 30-180 second operational range instead of a fixed timer', () => {
  const same = estimateTravelTime({ distanceGm: 50, profit: 1000, from: {}, to: {}, path: { jumpCount: 0 } }, { ship: stockShip })
  const jump = estimateTravelTime({ distanceGm: 50, profit: 1000, from: {}, to: {}, path: { jumpCount: 1 } }, { ship: stockShip })
  assert.ok(same)
  assert.ok(jump)
  assert.equal(same.totalSeconds, 288)
  assert.equal(jump.jumpCount, 1)
  assert.equal(jump.jumpSecondsMin, 30)
  assert.equal(jump.jumpSecondsMax, 180)
  assert.equal(jump.totalSecondsMin, 318)
  assert.equal(jump.totalSecondsMax, 468)
  assert.equal(jump.totalSeconds, jump.totalSecondsMin)
  assert.equal(jump.hasTravelRange, true)
  assert.ok(jump.profitPerMinuteMin < jump.profitPerMinuteMax)
  assert.equal(jump.unknownSegments.includes('время прохождения jump point'), false)
})

test('multiple jump tunnels accumulate their uncertainty independently', () => {
  const result = estimateTravelTime({ distanceGm: 10, profit: 10_000, from: {}, to: {}, path: { jumpCount: 2 } }, { ship: stockShip })
  assert.ok(result)
  assert.equal(result.jumpSecondsMin, 60)
  assert.equal(result.jumpSecondsMax, 360)
  assert.equal(result.totalSecondsMin, 124)
  assert.equal(result.totalSecondsMax, 424)
})

test('topology edge timing metadata overrides the fallback range', () => {
  const result = estimateTravelTime({
    distanceGm: 50,
    profit: 1000,
    from: {},
    to: {},
    path: {
      jumpCount: 1,
      jumps: [{ jumpTunnelMinSeconds: 45, jumpTunnelMaxSeconds: 90, jumpTunnelTimingSource: 'test-edge' }],
    },
  }, { ship: stockShip })
  assert.ok(result)
  assert.equal(result.jumpSecondsMin, 45)
  assert.equal(result.jumpSecondsMax, 90)
  assert.equal(result.totalSecondsMin, 333)
  assert.equal(result.totalSecondsMax, 378)
  assert.equal(result.jumpTimingSource, 'test-edge')
  assert.equal(result.jumpTimingFallbackCount, 0)
})

test('duration formatter is readable', () => {
  assert.equal(formatTravelDuration(699), '11 мин 39 с')
  assert.equal(formatTravelDuration(3720), '1 ч 2 мин')
  assert.equal(formatTravelDurationRange(699, 879), '11 мин 39 с–14 мин 39 с')
  assert.equal(formatTravelDurationRange(120, 120), '2 мин 0 с')
})
