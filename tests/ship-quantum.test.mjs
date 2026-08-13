import test from 'node:test'
import assert from 'node:assert/strict'
import { extractShipQuantumProfile, flattenVehiclePorts, isQuantumCacheFresh } from '../scripts/lib/ship-quantum.mjs'

test('vehicle ports flatten recursively', () => {
  const ports = [{ name: 'root', ports: [{ name: 'child', ports: [{ name: 'grandchild' }] }] }]
  assert.deepEqual(flattenVehiclePorts(ports).map((port) => port.name), ['root', 'child', 'grandchild'])
})

test('extracts stock QuantumDrive game specification from resolved vehicle port', () => {
  const vehicle = {
    name: 'Example Ship',
    version: '4.8.2-LIVE.test',
    quantum: { quantum_speed: 100_000_000, quantum_spool_time: 9, quantum_range: 80_000_000_000 },
    ports: [{
      type: 'System',
      ports: [{
        type: 'QuantumDrive',
        equipped_item_uuid: 'drive-uuid',
        equipped_item: {
          uuid: 'drive-uuid',
          name: 'XL-1',
          class_name: 'QDRV_WETK_S02_XL1_SCItem',
          type: 'QuantumDrive',
          size: 2,
          version: '4.8.2-LIVE.test',
          quantum_drive: {
            travel_time_10gm: { seconds: 56 },
            fuel_consumption_scu_per_gm: 0.02398,
            jump_range: 90_000_000_000,
            standard_jump: {
              drive_speed: 324_000_000,
              spool_up_time: 6,
              calibration_delay_in_seconds: 1.5,
              cooldown_time: 22.86,
            },
          },
        },
      }],
    }],
  }

  const profile = extractShipQuantumProfile(vehicle)
  assert.ok(profile)
  assert.equal(profile.driveName, 'XL-1')
  assert.equal(profile.driveSize, 2)
  assert.equal(profile.travelTime10GmSeconds, 56)
  assert.equal(profile.quantumSpeedMps, 324_000_000)
  assert.equal(profile.spoolUpTimeSeconds, 6)
  assert.equal(profile.calibrationDelaySeconds, 1.5)
  assert.equal(profile.cooldownTimeSeconds, 22.86)
  assert.equal(profile.fuelConsumptionScuPerGm, 0.02398)
  assert.equal(profile.source, 'StarCitizenWiki/scunpacked')
})

test('falls back to vehicle-level quantum speed and spool when drive item specification is unavailable', () => {
  const profile = extractShipQuantumProfile({
    version: '4.8.2-LIVE.test',
    quantum: { quantum_speed: 140_000_000, quantum_spool_time: 4, quantum_range: 78_000_000_000 },
    ports: [],
  })
  assert.ok(profile)
  assert.equal(profile.travelTime10GmSeconds, null)
  assert.equal(profile.quantumSpeedMps, 140_000_000)
  assert.equal(profile.spoolUpTimeSeconds, 4)
})

test('quantum cache freshness is deterministic', () => {
  const now = Date.parse('2026-08-13T00:00:00Z')
  assert.equal(isQuantumCacheFresh({ fetchedAt: '2026-08-12T12:00:00Z' }, now, 24), true)
  assert.equal(isQuantumCacheFresh({ fetchedAt: '2026-08-11T12:00:00Z' }, now, 24), false)
  assert.equal(isQuantumCacheFresh({}, now, 24), false)
})
