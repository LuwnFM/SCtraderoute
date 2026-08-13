export const ACTIVE_LIVE_SYSTEMS = Object.freeze(['Stanton', 'Pyro', 'Nyx'])

// LIVE PU topology only. This is intentionally not the full lore/ARK graph.
// CIG Alpha 4.4 introduced Nyx with two live gates: Stanton<->Nyx and Pyro<->Nyx.
// Stanton<->Nyx is explicitly temporary/redirected until the canonical topology is restored.
export const LIVE_CONNECTION_SPECS = Object.freeze([
  Object.freeze({
    id: 'stanton-pyro',
    from: 'Stanton',
    to: 'Pyro',
    fromGateway: Object.freeze({ uuid: '59b22155-405f-4785-9f73-d2028b46f5c3', name: 'Pyro Gateway', label: 'Pyro Gateway (Stanton)', system: 'Stanton' }),
    toGateway: Object.freeze({ uuid: 'a1b8a311-6465-45dc-873d-e8d06d4372df', name: 'Stanton Gateway', label: 'Stanton Gateway (Pyro)', system: 'Pyro' }),
    entryJumpPoint: Object.freeze({ uuid: 'f497eb74-7875-42e6-9694-632cb4a76f8c', name: 'Stanton-Pyro Jump Point', system: 'Stanton' }),
    exitJumpPoint: Object.freeze({ uuid: null, name: 'Pyro-Stanton Jump Point', system: 'Pyro' }),
    temporary: false,
  }),
  Object.freeze({
    id: 'pyro-nyx',
    from: 'Pyro',
    to: 'Nyx',
    fromGateway: Object.freeze({ uuid: '2cc61d92-b7bc-4533-9b97-6a32482a28f1', name: 'Nyx Gateway', label: 'Nyx Gateway (Pyro)', system: 'Pyro' }),
    toGateway: Object.freeze({ uuid: 'a66119fa-6d93-4e56-bcd1-c9bd2c50beb7', name: 'Pyro Gateway', label: 'Pyro Gateway (Nyx)', system: 'Nyx' }),
    entryJumpPoint: Object.freeze({ uuid: '80bac534-3e84-4a2d-97c2-3edefa2d5bef', name: 'Pyro - Nyx Jump Point', system: 'Pyro' }),
    exitJumpPoint: Object.freeze({ uuid: '63105afc-38df-48cc-b570-8eba703a57d7', name: 'Nyx - Pyro Jump Point', system: 'Nyx' }),
    temporary: false,
  }),
  Object.freeze({
    id: 'stanton-nyx-temporary',
    from: 'Stanton',
    to: 'Nyx',
    fromGateway: Object.freeze({ uuid: 'e1501a68-09e5-472e-93a4-01efcde8c8f8', name: 'Nyx Gateway', label: 'Nyx Gateway (Stanton)', system: 'Stanton' }),
    toGateway: Object.freeze({ uuid: '6396623a-61bd-4ced-9c8b-77c47753ef8f', name: 'Stanton Gateway', label: 'Stanton Gateway (Nyx)', system: 'Nyx' }),
    // LIVE currently reuses canonical starmap objects whose names still reference Magnus/Castra.
    // Never infer the live destination from these two names alone.
    entryJumpPoint: Object.freeze({ uuid: '1aacc387-4c9a-41d4-bba3-8a728eae07c6', name: 'Stanton - Magnus Jump Point', system: 'Stanton', redirected: true }),
    exitJumpPoint: Object.freeze({ uuid: '9328b87c-7722-4924-a7ab-ac314488dd5d', name: 'Nyx - Castra Jump Point', system: 'Nyx', redirected: true }),
    temporary: true,
    note: 'CIG LIVE placeholder: Stanton ↔ Nyx; underlying canonical starmap objects are redirected.',
  }),
])

export const JUMP_TUNNEL_OBSERVED_RANGE = Object.freeze({
  minSecondsPerJump: 30,
  maxSecondsPerJump: 180,
  deterministic: false,
  // User-observed operational range. Not treated as a CIG timing formula.
  source: 'operational-observation',
})

function normalizeSystem(value = '') {
  return String(value).replace(/\s+System$/i, '').trim()
}

function unwrap(payload) {
  if (payload && !Array.isArray(payload) && payload.data && !Array.isArray(payload.data)) return payload.data
  return payload
}

export function recordByUuid(records = []) {
  const map = new Map()
  for (const raw of records) {
    const record = unwrap(raw)
    if (record?.uuid) map.set(String(record.uuid), record)
  }
  return map
}

export function validateLiveLocationRecords(records = []) {
  const byUuid = recordByUuid(records)
  const warnings = []
  let checked = 0
  let version = null

  for (const spec of LIVE_CONNECTION_SPECS) {
    for (const part of ['fromGateway', 'toGateway', 'entryJumpPoint', 'exitJumpPoint']) {
      const expected = spec[part]
      if (!expected?.uuid) continue
      checked += 1
      const actual = byUuid.get(expected.uuid)
      if (!actual) {
        warnings.push(`${spec.id}:${part}:missing:${expected.uuid}`)
        continue
      }
      version ||= actual.version || null
      const actualSystem = normalizeSystem(actual.system || actual.star?.name || '')
      if (actualSystem && actualSystem !== expected.system) warnings.push(`${spec.id}:${part}:system:${actualSystem}!=${expected.system}`)
      if (actual.block_travel === true) warnings.push(`${spec.id}:${part}:travel-blocked`)
      if (part.includes('Gateway') && String(actual.name || '').trim() !== expected.name) warnings.push(`${spec.id}:${part}:name:${actual.name || 'unknown'}!=${expected.name}`)
    }
  }

  return { ok: warnings.length === 0, checked, warnings, version }
}

export function makeLiveJumpPoints(records = []) {
  const byUuid = recordByUuid(records)
  return LIVE_CONNECTION_SPECS.map((spec) => {
    const entry = spec.entryJumpPoint?.uuid ? byUuid.get(spec.entryJumpPoint.uuid) : null
    const exit = spec.exitJumpPoint?.uuid ? byUuid.get(spec.exitJumpPoint.uuid) : null
    return {
      id: spec.id,
      from: spec.from,
      to: spec.to,
      fromOrbit: spec.fromGateway.label,
      toOrbit: spec.toGateway.label,
      fromGatewayUuid: spec.fromGateway.uuid,
      toGatewayUuid: spec.toGateway.uuid,
      fromJumpPointUuid: spec.entryJumpPoint?.uuid || null,
      toJumpPointUuid: spec.exitJumpPoint?.uuid || null,
      fromJumpPointName: entry?.name || spec.entryJumpPoint?.name || null,
      toJumpPointName: exit?.name || spec.exitJumpPoint?.name || null,
      jumpTunnelMinSeconds: JUMP_TUNNEL_OBSERVED_RANGE.minSecondsPerJump,
      jumpTunnelMaxSeconds: JUMP_TUNNEL_OBSERVED_RANGE.maxSecondsPerJump,
      jumpTunnelDeterministic: JUMP_TUNNEL_OBSERVED_RANGE.deterministic,
      jumpTunnelTimingSource: JUMP_TUNNEL_OBSERVED_RANGE.source,
      temporary: Boolean(spec.temporary),
      redirected: Boolean(spec.entryJumpPoint?.redirected || spec.exitJumpPoint?.redirected),
      note: spec.note || null,
      source: 'StarCitizenWiki locations + CIG LIVE topology',
    }
  })
}

export function buildLiveTopology(records = [], options = {}) {
  const validation = validateLiveLocationRecords(records)
  const connections = makeLiveJumpPoints(records)
  return {
    model: 'cargonav-live-pu-topology-v1',
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceVersion: validation.version || options.sourceVersion || null,
    activeSystems: [...ACTIVE_LIVE_SYSTEMS],
    connections,
    jumpTunnelTiming: { ...JUMP_TUNNEL_OBSERVED_RANGE },
    validation,
    loreGraphIncluded: false,
    notes: [
      'Only systems physically available in the current PU are routable.',
      'Gateway is a station near a jump point; it is not the jump tunnel itself.',
      'Future/canonical ARK/Galactapedia connections are metadata only and are not used for trade routing.',
      'Stanton ↔ Nyx is a temporary LIVE redirect and must not be inferred from canonical jump-point names.',
    ],
  }
}
