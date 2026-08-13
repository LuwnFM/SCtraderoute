import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPath } from '../public/lib/trade-core.js'
import { ACTIVE_LIVE_SYSTEMS, LIVE_CONNECTION_SPECS, JUMP_TUNNEL_OBSERVED_RANGE, buildLiveTopology, makeLiveJumpPoints } from '../scripts/lib/live-topology.mjs'

function fakeRecord(part, overrides = {}) {
  return {
    uuid: part.uuid,
    name: part.name,
    system: `${part.system} System`,
    version: '4.9.0-LIVE.test',
    block_travel: false,
    ...overrides,
  }
}

function recordsForSpecs() {
  const out = []
  const seen = new Set()
  for (const spec of LIVE_CONNECTION_SPECS) {
    for (const part of [spec.fromGateway, spec.toGateway, spec.entryJumpPoint, spec.exitJumpPoint]) {
      if (!part?.uuid || seen.has(part.uuid)) continue
      seen.add(part.uuid)
      out.push(fakeRecord(part))
    }
  }
  return out
}

test('LIVE PU system allowlist contains only Stanton, Pyro and Nyx', () => {
  assert.deepEqual([...ACTIVE_LIVE_SYSTEMS].sort(), ['Nyx', 'Pyro', 'Stanton'])
})

test('gateway is kept separate from the jump-point object', () => {
  const stantonPyro = LIVE_CONNECTION_SPECS.find((edge) => edge.id === 'stanton-pyro')
  assert.ok(stantonPyro)
  assert.equal(stantonPyro.fromGateway.name, 'Pyro Gateway')
  assert.equal(stantonPyro.fromGateway.system, 'Stanton')
  assert.equal(stantonPyro.entryJumpPoint.name, 'Stanton-Pyro Jump Point')
  assert.notEqual(stantonPyro.fromGateway.uuid, stantonPyro.entryJumpPoint.uuid)
})

test('Stanton to Pyro uses the physically correct gateway sides', () => {
  const path = buildSystemPath(makeLiveJumpPoints(recordsForSpecs()), 'Stanton', 'Pyro')
  assert.deepEqual(path.systems, ['Stanton', 'Pyro'])
  assert.equal(path.jumpCount, 1)
  assert.equal(path.jumps[0].fromOrbit, 'Pyro Gateway (Stanton)')
  assert.equal(path.jumps[0].toOrbit, 'Stanton Gateway (Pyro)')
})

test('Pyro to Nyx uses Nyx Gateway in Pyro and Pyro Gateway in Nyx', () => {
  const path = buildSystemPath(makeLiveJumpPoints(recordsForSpecs()), 'Pyro', 'Nyx')
  assert.deepEqual(path.systems, ['Pyro', 'Nyx'])
  assert.equal(path.jumpCount, 1)
  assert.equal(path.jumps[0].fromOrbit, 'Nyx Gateway (Pyro)')
  assert.equal(path.jumps[0].toOrbit, 'Pyro Gateway (Nyx)')
})

test('current LIVE Stanton to Nyx is direct and explicitly temporary', () => {
  const points = makeLiveJumpPoints(recordsForSpecs())
  const edge = points.find((item) => item.id === 'stanton-nyx-temporary')
  assert.ok(edge)
  assert.equal(edge.temporary, true)
  assert.equal(edge.redirected, true)
  assert.equal(edge.fromJumpPointName, 'Stanton - Magnus Jump Point')
  assert.equal(edge.toJumpPointName, 'Nyx - Castra Jump Point')

  const path = buildSystemPath(points, 'Stanton', 'Nyx')
  assert.deepEqual(path.systems, ['Stanton', 'Nyx'])
  assert.equal(path.jumpCount, 1)
  assert.equal(path.jumps[0].fromOrbit, 'Nyx Gateway (Stanton)')
  assert.equal(path.jumps[0].toOrbit, 'Stanton Gateway (Nyx)')
})

test('future lore systems are never added just because game data contains jump-point objects', () => {
  const topology = buildLiveTopology(recordsForSpecs())
  const systems = new Set(topology.connections.flatMap((edge) => [edge.from, edge.to]))
  for (const future of ['Terra', 'Castra', 'Cano', 'Hadrian', 'Oso', 'Magnus']) assert.equal(systems.has(future), false)
  assert.deepEqual([...systems].sort(), ['Nyx', 'Pyro', 'Stanton'])
})

test('location validation accepts both Anomaly-era and JumpPoint-era endpoint records by UUID/system, not by type name', () => {
  const records = recordsForSpecs().map((record) => ({ ...record, type: record.name.includes('Magnus') ? { name: 'JumpPoint' } : { name: 'Anomaly' } }))
  const topology = buildLiveTopology(records)
  assert.equal(topology.validation.ok, true)
  assert.equal(topology.validation.warnings.length, 0)
})

test('jump tunnel timing is represented as a non-deterministic operational range, not an exact timer', () => {
  assert.equal(JUMP_TUNNEL_OBSERVED_RANGE.minSecondsPerJump, 30)
  assert.equal(JUMP_TUNNEL_OBSERVED_RANGE.maxSecondsPerJump, 180)
  assert.equal(JUMP_TUNNEL_OBSERVED_RANGE.deterministic, false)
})
