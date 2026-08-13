import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTIVE_LIVE_SYSTEMS, LIVE_CONNECTION_SPECS, buildLiveTopology } from './lib/live-topology.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = path.join(ROOT, 'public/data/trade-snapshot.json')
const SCWIKI = process.env.SCWIKI_API_BASE || 'https://api.star-citizen.wiki/api'
const STRICT = process.env.SCWIKI_TOPOLOGY_STRICT === '1'

async function fetchJson(url, timeoutMs = 20_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'CargoNav/3.2 (+https://github.com/LuwnFM/SCtraderoute)',
      },
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function unwrap(payload) {
  if (payload && !Array.isArray(payload) && payload.data && !Array.isArray(payload.data)) return payload.data
  return payload
}

function uniqueLocationUuids() {
  const uuids = new Set()
  for (const spec of LIVE_CONNECTION_SPECS) {
    for (const part of [spec.fromGateway, spec.toGateway, spec.entryJumpPoint, spec.exitJumpPoint]) {
      if (part?.uuid) uuids.add(part.uuid)
    }
  }
  return [...uuids]
}

async function fetchTopologyRecords() {
  const errors = []
  let listProbeCount = null
  let listProbeVersion = null

  try {
    const list = await fetchJson(`${SCWIKI}/locations`)
    const rows = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : []
    listProbeCount = rows.length
    listProbeVersion = rows.find((row) => row?.version)?.version || null
  } catch (error) {
    errors.push(`locations-list:${error instanceof Error ? error.message : String(error)}`)
  }

  const records = []
  const uuids = uniqueLocationUuids()
  for (let i = 0; i < uuids.length; i += 6) {
    const batch = uuids.slice(i, i + 6)
    const results = await Promise.all(batch.map(async (uuid) => {
      try {
        const payload = await fetchJson(`${SCWIKI}/locations/${encodeURIComponent(uuid)}`)
        const record = unwrap(payload)
        if (!record?.uuid) throw new Error('missing location payload')
        return record
      } catch (error) {
        errors.push(`${uuid}:${error instanceof Error ? error.message : String(error)}`)
        return null
      }
    }))
    records.push(...results.filter(Boolean))
  }

  return { records, errors, listProbeCount, listProbeVersion }
}

function replaceSourceReport(reports, next) {
  return [...(Array.isArray(reports) ? reports : []).filter((item) => item?.name !== next.name), next]
}

async function main() {
  const snapshot = JSON.parse(await fs.readFile(SNAPSHOT, 'utf8'))
  const probe = await fetchTopologyRecords()
  const topology = buildLiveTopology(probe.records, {
    generatedAt: new Date().toISOString(),
    sourceVersion: probe.listProbeVersion || snapshot.meta?.gameVersion || null,
  })

  // The route graph is deliberately replaced, not merged with UEX/ARK lore edges.
  // That prevents future/unreleased systems from becoming accidental trade routes.
  snapshot.jumpPoints = topology.connections
  snapshot.liveTopology = topology
  snapshot.meta = {
    ...(snapshot.meta || {}),
    schemaVersion: Math.max(4, Number(snapshot.meta?.schemaVersion || 0)),
    activeSystems: [...ACTIVE_LIVE_SYSTEMS],
    topologyModel: topology.model,
    topologyVersion: topology.sourceVersion,
  }

  const warningText = [
    ...topology.validation.warnings,
    ...probe.errors,
  ]
  const report = {
    name: 'LIVE gateway topology',
    ok: topology.validation.ok && probe.errors.length === 0,
    note: `${topology.connections.length} active межсистемных связей · ${topology.validation.checked} location records checked · systems: ${ACTIVE_LIVE_SYSTEMS.join(', ')}${probe.listProbeCount != null ? ` · /locations page probe: ${probe.listProbeCount}` : ''}${topology.connections.some((edge) => edge.temporary) ? ' · Stanton↔Nyx temporary redirect' : ''}${warningText.length ? ` · warnings: ${warningText.join(' | ')}` : ''}`,
  }
  snapshot.meta.sourceReports = replaceSourceReport(snapshot.meta.sourceReports, report)

  await fs.writeFile(SNAPSHOT, JSON.stringify(snapshot))
  console.log(`LIVE topology: ${topology.connections.map((edge) => `${edge.from}<->${edge.to}${edge.temporary ? ' (temporary)' : ''}`).join(', ')}`)
  console.log(report)

  if (STRICT && !report.ok) {
    throw new Error(`LIVE topology validation failed: ${warningText.join(' | ') || 'unknown validation error'}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
