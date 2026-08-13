import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_FILTERS, commodityKey, computeRoutes, normalizeName, parseTimestamp, systemFromLocationPath, terminalKey } from '../public/lib/trade-core.js'
import { filterCandidatePriceOutliers } from './lib/price-quality.mjs'
import { extractShipQuantumProfile, isQuantumCacheFresh } from './lib/ship-quantum.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(ROOT, 'public/data/trade-snapshot.json')
const SHIP_QUANTUM_CACHE = path.join(ROOT, 'public/data/ship-quantum.json')
const UEX = process.env.UEX_API_BASE || 'https://api.uexcorp.space/2.0'
const SCT = process.env.SCTRADE_API_BASE || 'https://sc-trade.tools'
const SCWIKI = process.env.SCWIKI_API_BASE || 'https://api.star-citizen.wiki/api'
const SCT_PAGES = Math.max(1, Math.min(60, Number(process.env.SCTRADE_CROWD_MAX_PAGES || 20)))
const DISTANCE_LIMIT = Math.max(0, Math.min(250, Number(process.env.UEX_DISTANCE_PAIRS || 80)))
const SHIP_QUANTUM_MAX_FETCHES = Math.max(0, Math.min(250, Number(process.env.SCWIKI_QUANTUM_MAX_FETCHES || 180)))
const SHIP_QUANTUM_REFRESH_HOURS = Math.max(1, Math.min(720, Number(process.env.SCWIKI_QUANTUM_REFRESH_HOURS || 24)))
const SHIP_QUANTUM_CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.SCWIKI_QUANTUM_CONCURRENCY || 6)))

const report = []
const nowIso = () => new Date().toISOString()

async function fetchJson(url, options = {}, timeoutMs = 30_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, headers: { 'user-agent': 'CargoNav/3.1 (+https://github.com/LuwnFM/SCtraderoute)', accept: 'application/json', ...(options.headers || {}) } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally { clearTimeout(timer) }
}

async function readJsonFile(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

async function readExisting() {
  return readJsonFile(OUTPUT, null)
}

function uexArray(response, name) {
  if (!response || response.status !== 'ok' || !Array.isArray(response.data)) throw new Error(`${name}: unexpected UEX response`)
  return response.data
}

function compactUniqueNumbers(value) {
  if (Array.isArray(value)) return [...new Set(value.map(Number).filter((n) => n > 0))].sort((a, b) => a - b)
  return [...new Set(String(value || '').split(/[|,]/).map(Number).filter((n) => n > 0))].sort((a, b) => a - b)
}

function uexLocation(t) {
  const primary = String(t.nickname || t.fullname || t.displayname || t.name || '').trim()
  const parts = [t.space_station_name, t.city_name, t.outpost_name, t.moon_name, t.planet_name, t.orbit_name]
    .map((x) => String(x || '').trim()).filter(Boolean)
  const seen = new Set([normalizeName(primary)])
  const extra = []
  for (const p of parts) {
    const n = normalizeName(p)
    if (!n || [...seen].some((s) => s.includes(n) || n.includes(s))) continue
    seen.add(n); extra.push(p)
  }
  return extra.slice(0, 2).join(' · ') || '—'
}

function normalizeUex(commoditiesRaw, terminalsRaw, pricesRaw, vehiclesRaw, jumpRaw) {
  const commodities = commoditiesRaw
    .filter((c) => Number(c.is_visible ?? 1) !== 0)
    .map((c) => ({ key: commodityKey(c.name), uexId: Number(c.id), name: String(c.name || ''), code: String(c.code || ''), isIllegal: Number(c.is_illegal) === 1, kind: c.kind || null }))

  const terminals = terminalsRaw
    .filter((t) => t.type === 'commodity' && Number(t.is_visible ?? 1) !== 0)
    .map((t) => {
      const name = String(t.nickname || t.fullname || t.displayname || t.name || '').trim()
      const system = String(t.star_system_name || 'Неизвестно')
      return {
        key: terminalKey(system, t.fullname || name), uexId: Number(t.id), name, fullName: String(t.fullname || name), system,
        location: uexLocation(t), maxContainerSize: Number(t.max_container_size || 0), hasFreightElevator: Number(t.has_freight_elevator) === 1,
        isPlayerOwned: Number(t.is_player_owned) === 1,
        aliases: [t.name, t.nickname, t.fullname, t.displayname, t.code].map((x) => String(x || '').trim()).filter(Boolean),
      }
    })

  const commodityById = new Map(commodities.map((c) => [c.uexId, c]))
  const terminalById = new Map(terminals.map((t) => [t.uexId, t]))
  const listings = []
  for (const p of pricesRaw) {
    const commodity = commodityById.get(Number(p.id_commodity)); const terminal = terminalById.get(Number(p.id_terminal))
    if (!commodity || !terminal) continue
    const updatedAt = parseTimestamp(p.date_modified || p.date_added)
    const boxSizes = compactUniqueNumbers(p.container_sizes)
    if (Number(p.price_buy) > 0) listings.push({ key: `uex:sells:${p.id_commodity}:${p.id_terminal}`, commodityKey: commodity.key, commodityName: commodity.name, locationKey: terminal.key, action: 'SELLS', price: Number(p.price_buy), quantity: Number(p.scu_buy) >= 0 ? Number(p.scu_buy) : null, boxSizes, updatedAt, source: 'UEX' })
    if (Number(p.price_sell) > 0) listings.push({ key: `uex:buys:${p.id_commodity}:${p.id_terminal}`, commodityKey: commodity.key, commodityName: commodity.name, locationKey: terminal.key, action: 'BUYS', price: Number(p.price_sell), quantity: Number(p.scu_sell) >= 0 ? Number(p.scu_sell) : null, boxSizes, updatedAt, source: 'UEX' })
  }

  const ships = vehiclesRaw
    .filter((v) => Number(v.scu || 0) > 0)
    .map((v) => ({
      id: Number(v.id), uuid: String(v.uuid || '').trim() || undefined, name: String(v.name_full || v.name || ''), scu: Number(v.scu), manufacturer: String(v.company_name || ''), crew: String(v.crew || ''),
      containerSizes: compactUniqueNumbers(v.container_sizes), quantumFuel: Number(v.fuel_quantum || 0), hydrogenFuel: Number(v.fuel_hydrogen || 0),
      isCargo: Number(v.is_cargo) === 1, isGroundVehicle: Number(v.is_ground_vehicle) === 1, isConcept: Number(v.is_concept) === 1,
      isSpaceship: Number(v.is_spaceship ?? 1) === 1, isQuantumCapable: Number(v.is_quantum_capable ?? 1) === 1,
    }))
    .sort((a, b) => a.scu - b.scu || a.name.localeCompare(b.name))

  const jumpPoints = jumpRaw.map((j) => ({ from: String(j.star_system_name_origin || ''), to: String(j.star_system_name_destination || ''), fromOrbit: j.orbit_name_origin || null, toOrbit: j.orbit_name_destination || null, updatedAt: parseTimestamp(j.date_modified || j.date_added), source: 'UEX' })).filter((j) => j.from && j.to)
  return { commodities, terminals, listings, ships, jumpPoints }
}

function buildAliasIndex(terminals) {
  const entries = []
  for (const t of terminals) {
    for (const alias of [t.name, t.fullName, t.location, ...(t.aliases || [])]) {
      const n = normalizeName(alias)
      if (n.length >= 3) entries.push([n, t])
    }
  }
  entries.sort((a, b) => b[0].length - a[0].length)
  return entries
}

function resolveSctTerminal(location, terminals, aliasIndex) {
  const n = normalizeName(location)
  for (const [alias, t] of aliasIndex) {
    if (n === alias || n.includes(alias) || alias.includes(n)) return t
  }
  const system = systemFromLocationPath(location)
  const key = terminalKey(system, location)
  let t = terminals.find((x) => x.key === key)
  if (!t) {
    const parts = String(location).split('>').map((x) => x.trim()).filter(Boolean)
    t = { key, name: parts.at(-1) || location, fullName: location, system, location: parts.slice(1, -1).join(' · ') || 'SC Trade Tools', maxContainerSize: 0, aliases: [location], synthetic: true }
    terminals.push(t)
    aliasIndex.unshift([n, t])
  }
  return t
}

async function fetchUex() {
  const names = ['commodities', 'terminals', 'commodities_prices_all', 'vehicles', 'jump_points']
  const responses = await Promise.all(names.map((n) => fetchJson(`${UEX}/${n}`)))
  const arrays = responses.map((r, i) => uexArray(r, names[i]))
  const normalized = normalizeUex(...arrays)
  report.push({ name: 'UEX', ok: true, note: `${normalized.listings.length} ценовых листингов · ${normalized.terminals.length} терминалов` })
  return { ...normalized, gameVersion: arrays[2].find((x) => x.game_version)?.game_version || arrays[3].find((x) => x.game_version)?.game_version || null }
}

async function fetchScTrade(base) {
  const terminals = [...base.terminals]
  const commodities = [...base.commodities]
  const aliasIndex = buildAliasIndex(terminals)
  const commodityByNorm = new Map(commodities.map((c) => [normalizeName(c.name), c]))
  const listings = []
  let pagesRead = 0
  let totalPages = SCT_PAGES
  for (let page = 0; page < Math.min(SCT_PAGES, totalPages); page += 1) {
    const json = await fetchJson(`${SCT}/api/crowdsource/commodity-listings?page=${page}`)
    const content = Array.isArray(json?.content) ? json.content : []
    totalPages = Math.max(1, Number(json?.page?.totalPages || totalPages))
    pagesRead += 1
    for (const row of content) {
      const name = String(row.commodity || '').trim(); const location = String(row.location || '').trim(); const action = String(row.transaction || '').toUpperCase()
      if (!name || !location || !['BUYS', 'SELLS'].includes(action) || !(Number(row.price) > 0)) continue
      const norm = normalizeName(name)
      let commodity = commodityByNorm.get(norm)
      if (!commodity) { commodity = { key: commodityKey(name), name, code: '', isIllegal: false, sourceOnly: 'SC Trade Tools' }; commodityByNorm.set(norm, commodity); commodities.push(commodity) }
      const terminal = resolveSctTerminal(location, terminals, aliasIndex)
      listings.push({ key: `sct:${row.batchId || page}:${action}:${commodity.key}:${terminal.key}`, commodityKey: commodity.key, commodityName: commodity.name, locationKey: terminal.key, action, price: Number(row.price), quantity: Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : null, boxSizes: compactUniqueNumbers(row.boxSizesInScu), updatedAt: parseTimestamp(row.timestamp), source: 'SC Trade Tools' })
    }
    if (!content.length) break
  }
  report.push({ name: 'SC Trade Tools', ok: true, note: `${listings.length} crowdsource листингов · ${pagesRead} стр.` })
  return { terminals, commodities, listings }
}

function mergeLatestListings(listings) {
  const byKey = new Map()
  for (const l of listings) {
    const k = `${l.source}|${l.commodityKey}|${l.locationKey}|${l.action}`
    const prev = byKey.get(k)
    if (!prev || (l.updatedAt || 0) > (prev.updatedAt || 0)) byKey.set(k, l)
  }
  return [...byKey.values()]
}

async function mapLimited(items, concurrency, worker) {
  const result = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      result[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return result
}

async function enrichShipQuantum(ships) {
  if (!SHIP_QUANTUM_MAX_FETCHES || !ships.length) return ships
  const cache = await readJsonFile(SHIP_QUANTUM_CACHE, { meta: {}, profiles: {} }) || { meta: {}, profiles: {} }
  if (!cache.profiles || typeof cache.profiles !== 'object') cache.profiles = {}
  const now = Date.now()
  const candidates = ships.filter((ship) => ship.uuid && ship.isSpaceship !== false && ship.isGroundVehicle !== true && ship.isConcept !== true && ship.isQuantumCapable !== false)
  const stale = candidates.filter((ship) => !isQuantumCacheFresh(cache.profiles[ship.uuid], now, SHIP_QUANTUM_REFRESH_HOURS)).slice(0, SHIP_QUANTUM_MAX_FETCHES)
  let failures = 0
  let fetched = 0

  await mapLimited(stale, SHIP_QUANTUM_CONCURRENCY, async (ship) => {
    try {
      const url = `${SCWIKI}/vehicles/${encodeURIComponent(ship.uuid)}`
      const json = await fetchJson(url, {}, 20_000)
      const vehicle = json?.data || json
      const profile = extractShipQuantumProfile(vehicle)
      cache.profiles[ship.uuid] = { fetchedAt: nowIso(), profile, vehicleName: vehicle?.name || ship.name, sourceVersion: profile?.sourceVersion || vehicle?.version || null }
      fetched += 1
    } catch (error) {
      failures += 1
      if (!cache.profiles[ship.uuid]) cache.profiles[ship.uuid] = { fetchedAt: new Date(0).toISOString(), profile: null, error: error instanceof Error ? error.message : String(error) }
    }
  })

  cache.meta = { generatedAt: nowIso(), source: 'StarCitizenWiki/scunpacked', refreshHours: SHIP_QUANTUM_REFRESH_HOURS }
  await fs.mkdir(path.dirname(SHIP_QUANTUM_CACHE), { recursive: true })
  await fs.writeFile(SHIP_QUANTUM_CACHE, JSON.stringify(cache))

  const enriched = ships.map((ship) => {
    const profile = ship.uuid ? cache.profiles?.[ship.uuid]?.profile : null
    return profile ? { ...ship, quantumDrive: profile } : ship
  })
  const withExactTravel = enriched.filter((ship) => Number(ship.quantumDrive?.travelTime10GmSeconds) > 0).length
  const withAnyProfile = enriched.filter((ship) => ship.quantumDrive).length
  report.push({
    name: 'StarCitizenWiki game data',
    ok: withAnyProfile > 0,
    note: `${withAnyProfile}/${candidates.length} кораблей с QD-профилем · ${withExactTravel} с TravelTime10GM · обновлено ${fetched}${failures ? ` · ошибок ${failures}` : ''}`,
  })
  return enriched
}

async function fetchDistances(snapshot) {
  if (!DISTANCE_LIMIT) return []
  const candidates = computeRoutes(snapshot, { ...DEFAULT_FILTERS, capacity: 128, budget: 1_000_000, sort: 'profit' }).slice(0, 300)
  const pairs = []
  const seen = new Set()
  for (const r of candidates) {
    if (!(r.from?.uexId && r.to?.uexId)) continue
    const k = [r.from.uexId, r.to.uexId].sort((a, b) => a - b).join('|')
    if (seen.has(k)) continue
    seen.add(k); pairs.push(r)
    if (pairs.length >= DISTANCE_LIMIT) break
  }
  const out = []
  for (let i = 0; i < pairs.length; i += 10) {
    const batch = pairs.slice(i, i + 10)
    const results = await Promise.all(batch.map(async (r) => {
      try {
        const json = await fetchJson(`${UEX}/terminals_distances?id_terminal_origin=${r.from.uexId}&id_terminal_destination=${r.to.uexId}`, {}, 15_000)
        const data = Array.isArray(json?.data) ? json.data[0] : json?.data
        if (!(Number(data?.distance) >= 0)) return null
        return { fromKey: r.from.key, toKey: r.to.key, distanceGm: Number(data.distance), source: 'UEX' }
      } catch { return null }
    }))
    out.push(...results.filter(Boolean))
  }
  return out
}

async function main() {
  const existing = await readExisting()
  let uex = null
  try { uex = await fetchUex() } catch (e) { report.push({ name: 'UEX', ok: false, note: e instanceof Error ? e.message : String(e) }) }

  let base
  if (uex) base = uex
  else if (existing) base = { commodities: existing.commodities || [], terminals: existing.terminals || [], listings: (existing.listings || []).filter((x) => x.source === 'UEX'), ships: existing.ships || [], jumpPoints: existing.jumpPoints || [], gameVersion: existing.meta?.gameVersion || null }
  else throw new Error('UEX unavailable and no previous snapshot exists')

  try { base.ships = await enrichShipQuantum(base.ships || []) } catch (e) { report.push({ name: 'StarCitizenWiki game data', ok: false, note: e instanceof Error ? e.message : String(e) }) }

  let sc = null
  try { sc = await fetchScTrade(base) } catch (e) { report.push({ name: 'SC Trade Tools', ok: false, note: e instanceof Error ? e.message : String(e) }) }

  if (sc) {
    const quality = filterCandidatePriceOutliers(sc.listings, base.listings)
    sc.listings = quality.accepted
    const reasons = quality.rejected.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1
      return acc
    }, {})
    const reasonText = Object.entries(reasons).map(([reason, count]) => `${reason}: ${count}`).join(', ')
    report.push({
      name: 'SC Trade Tools quality',
      ok: true,
      note: `${quality.accepted.length} принято · ${quality.rejected.length} выбросов отклонено${reasonText ? ` (${reasonText})` : ''}`,
    })
  }

  const snapshot = {
    meta: { generatedAt: nowIso(), gameVersion: base.gameVersion || existing?.meta?.gameVersion || null, sourceReports: report, schemaVersion: 3 },
    commodities: sc?.commodities || base.commodities,
    terminals: sc?.terminals || base.terminals,
    ships: base.ships,
    jumpPoints: base.jumpPoints,
    listings: mergeLatestListings([...(base.listings || []), ...(sc?.listings || [])]),
    distances: existing?.distances || [],
  }

  try {
    const distances = await fetchDistances({ ...snapshot, distances: [] })
    if (distances.length) snapshot.distances = distances
  } catch (e) {
    report.push({ name: 'UEX distances', ok: false, note: e instanceof Error ? e.message : String(e) })
  }

  if (!uex && !sc && existing) {
    console.warn('All live sources failed; keeping the previous snapshot unchanged.')
    return
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(snapshot))
  console.log(`Wrote ${OUTPUT}: ${snapshot.listings.length} listings, ${snapshot.terminals.length} terminals, ${snapshot.distances.length} distances, ${snapshot.ships.filter((ship) => ship.quantumDrive).length} ship QD profiles`)
  console.log(report)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })