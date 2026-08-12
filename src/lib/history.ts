import type { TradeRoute } from './routes'

type CompactHistoryRow = [number, number, number]
type HistoryEntry = { fetchedAt?: string; rows?: CompactHistoryRow[] }
type HistoryCache = { meta?: { generatedAt?: string; cachedPairs?: number }; series?: Record<string, HistoryEntry> }
export type HistoryPoint = { t: number; v: number; kind: 'buy' | 'sell'; locationName: string }
export type RouteHistoryResult = { points: HistoryPoint[]; missing: string[]; generatedAt?: string }

let cachePromise: Promise<HistoryCache> | null = null

function key(terminalId?: number, commodityId?: number) {
  if (!(Number(terminalId) > 0) || !(Number(commodityId) > 0)) return ''
  return `${Number(terminalId)}:${Number(commodityId)}`
}

async function loadCache(): Promise<HistoryCache> {
  if (!cachePromise) {
    const base = import.meta.env.BASE_URL || '/'
    cachePromise = fetch(`${base}data/trade-history.json`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Кэш истории недоступен: HTTP ${response.status}`)
        const json = await response.json() as HistoryCache
        if (!json || typeof json !== 'object' || !json.series) throw new Error('Кэш истории повреждён')
        return json
      })
      .catch((error) => {
        cachePromise = null
        throw error
      })
  }
  return cachePromise
}

function points(entry: HistoryEntry | undefined, kind: 'buy' | 'sell', locationName: string): HistoryPoint[] {
  const index = kind === 'buy' ? 1 : 2
  return (entry?.rows || [])
    .map((row) => ({ t: Number(row?.[0] || 0), v: Number(row?.[index] || 0), kind, locationName }))
    .filter((point) => point.t > 0 && point.v > 0)
}

export async function loadRouteHistory(route: TradeRoute): Promise<RouteHistoryResult> {
  const commodityId = route.commodity.uexId
  const fromKey = key(route.from.uexId, commodityId)
  const toKey = key(route.to.uexId, commodityId)
  if (!fromKey && !toKey) return { points: [], missing: ['UEX ID отсутствуют для обеих точек'] }
  const cache = await loadCache()
  const missing: string[] = []
  const origin = fromKey ? cache.series?.[fromKey] : undefined
  const destination = toKey ? cache.series?.[toKey] : undefined
  if (fromKey && !origin) missing.push(`${route.from.name}: история ещё не попала в кэш`)
  if (toKey && !destination) missing.push(`${route.to.name}: история ещё не попала в кэш`)
  const result = [
    ...points(origin, 'buy', route.from.name),
    ...points(destination, 'sell', route.to.name),
  ].sort((a, b) => a.t - b.t)
  return { points: result, missing, generatedAt: cache.meta?.generatedAt }
}
