import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeRoutes, DEFAULT_FILTERS } from '../public/lib/trade-core.js'
import { HISTORY_SCHEMA_VERSION, cacheEntryNeedsRefresh, compactHistoryRows, historyKey } from './lib/history-cache.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT_FILE = path.join(ROOT, 'public/data/trade-snapshot.json')
const OUTPUT = path.join(ROOT, 'public/data/trade-history.json')
const UEX = process.env.UEX_API_BASE || 'https://api.uexcorp.uk/2.0'
const FETCH_LIMIT = Math.max(0, Math.min(100, Number(process.env.UEX_HISTORY_PAIRS || 30)))
const MAX_POINTS = Math.max(10, Math.min(250, Number(process.env.UEX_HISTORY_POINTS || 90)))
const REFRESH_HOURS = Math.max(1, Number(process.env.UEX_HISTORY_REFRESH_HOURS || 48))
const MAX_CACHE_PAIRS = Math.max(50, Math.min(2000, Number(process.env.UEX_HISTORY_CACHE_PAIRS || 1000)))
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.UEX_HISTORY_CONCURRENCY || 6)))

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

function pairFrom(snapshot, terminalKeyValue, commodityKeyValue) {
  const terminal = snapshot.terminals.find((item) => item.key === terminalKeyValue)
  const commodity = snapshot.commodities.find((item) => item.key === commodityKeyValue)
  if (!(terminal?.uexId > 0) || !(commodity?.uexId > 0)) return null
  const key = historyKey(terminal.uexId, commodity.uexId)
  return key ? { key, terminalId: Number(terminal.uexId), commodityId: Number(commodity.uexId), terminalName: terminal.name, commodityName: commodity.name } : null
}

function candidatePairs(snapshot) {
  const pairs = new Map()
  const priority = new Set()
  const add = (pair, isPriority = false) => {
    if (!pair?.key) return
    if (!pairs.has(pair.key)) pairs.set(pair.key, pair)
    if (isPriority) priority.add(pair.key)
  }

  const profiles = [
    { capacity: 96, budget: 1_000_000 },
    { capacity: 696, budget: 1_000_000 },
    { capacity: 4608, budget: 1_000_000 },
    { capacity: 4608, budget: 0 },
  ]
  for (const profile of profiles) {
    const routes = computeRoutes(snapshot, { ...DEFAULT_FILTERS, ...profile, requireKnownAvailability: false, sort: 'profit' }).slice(0, 40)
    for (const route of routes) {
      add(pairFrom(snapshot, route.from.key, route.commodity.key), true)
      add(pairFrom(snapshot, route.to.key, route.commodity.key), true)
    }
  }

  const uexListings = (snapshot.listings || [])
    .filter((listing) => listing.source === 'UEX')
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  for (const listing of uexListings) add(pairFrom(snapshot, listing.locationKey, listing.commodityKey), false)
  return { pairs: [...pairs.values()], priority }
}

async function fetchHistory(pair) {
  const url = `${UEX}/commodities_prices_history?id_terminal=${encodeURIComponent(pair.terminalId)}&id_commodity=${encodeURIComponent(pair.commodityId)}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const response = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'CargoNav/3.0 (+https://github.com/LuwnFM/SCtraderoute)' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const json = await response.json()
    if (json?.status !== 'ok' || !Array.isArray(json.data)) throw new Error(`UEX status ${json?.status || 'unknown'}`)
    return compactHistoryRows(json.data, MAX_POINTS)
  } finally { clearTimeout(timer) }
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  let cursor = 0
  const out = []
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return out
}

async function main() {
  const snapshot = await readJson(SNAPSHOT_FILE, null)
  if (!snapshot?.listings?.length) throw new Error('trade-snapshot.json отсутствует или пуст')
  const existing = await readJson(OUTPUT, { meta: {}, series: {} })
  const existingSeries = existing?.series && typeof existing.series === 'object' ? existing.series : {}
  const { pairs, priority } = candidatePairs(snapshot)
  const now = Date.now()

  const missingPriority = [], missingOther = [], stalePriority = [], staleOther = []
  for (const pair of pairs) {
    const entry = existingSeries[pair.key]
    if (!entry) (priority.has(pair.key) ? missingPriority : missingOther).push(pair)
    else if (cacheEntryNeedsRefresh(entry, now, REFRESH_HOURS)) (priority.has(pair.key) ? stalePriority : staleOther).push(pair)
  }
  const selected = [...missingPriority, ...missingOther, ...stalePriority, ...staleOther].slice(0, FETCH_LIMIT)
  const nextSeries = { ...existingSeries }
  let ok = 0, failed = 0
  await runPool(selected, async (pair) => {
    try {
      const rows = await fetchHistory(pair)
      nextSeries[pair.key] = { fetchedAt: new Date().toISOString(), terminalId: pair.terminalId, commodityId: pair.commodityId, terminalName: pair.terminalName, commodityName: pair.commodityName, rows }
      ok += 1
    } catch (error) {
      failed += 1
      console.warn(`History ${pair.key} failed:`, error instanceof Error ? error.message : String(error))
    }
  })

  const relevant = new Set(pairs.map((pair) => pair.key))
  const retained = Object.entries(nextSeries)
    .filter(([key]) => relevant.has(key))
    .sort((a, b) => {
      const ap = priority.has(a[0]) ? 1 : 0, bp = priority.has(b[0]) ? 1 : 0
      if (ap !== bp) return bp - ap
      return Date.parse(b[1]?.fetchedAt || 0) - Date.parse(a[1]?.fetchedAt || 0)
    })
    .slice(0, MAX_CACHE_PAIRS)
  const series = Object.fromEntries(retained)
  const output = {
    meta: {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'UEX commodities_prices_history',
      cachedPairs: Object.keys(series).length,
      requestedThisRun: selected.length,
      updatedThisRun: ok,
      failedThisRun: failed,
      candidatePairs: pairs.length,
    },
    series,
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(output))
  console.log(`History cache: ${output.meta.cachedPairs}/${output.meta.candidatePairs} pairs; fetched ${ok}/${selected.length}; failures ${failed}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
