import type { Commodity, Listing, Ship, Terminal, TradeSnapshot } from './data'

export type SortKey = 'profit' | 'profitPerScu' | 'margin' | 'roi' | 'freshness' | 'distance'

export interface RouteFilters {
  capacity: number
  budget: number
  systemFrom: string
  systemTo: string
  terminalFrom: string
  terminalTo: string
  commodityKey: string
  onlyLegal: boolean
  onlySameSystem: boolean
  requireKnownAvailability: boolean
  minProfit: number
  minRoi: number
  minProfitPerScu: number
  maxAgeHours: number
  maxDistanceGm: number
  containerSize: number
  search: string
  sort: SortKey
  favoritesOnly: boolean
}

export interface RoutePath {
  systems: string[]
  jumps: Array<{ from: string; to: string; fromOrbit?: string; toOrbit?: string; source?: string }>
  jumpCount: number | null
}

export interface TradeRoute {
  key: string
  commodity: Commodity
  from: Terminal
  to: Terminal
  buyPrice: number
  sellPrice: number
  units: number
  investment: number
  revenue: number
  profit: number
  profitPerScu: number
  margin: number
  roi: number
  supply: number | null
  demand: number | null
  sameSystem: boolean
  availabilityUnknown: boolean
  limitedBy: 'трюм' | 'бюджет' | 'наличие' | 'спрос' | null
  buyUpdatedAt: number
  sellUpdatedAt: number
  freshnessAt: number
  stale: boolean
  sources: string[]
  distanceGm: number | null
  maxContainerSize: number
  path: RoutePath
  originListing: Listing
  destinationListing: Listing
}

export interface MultiStopRoute {
  key: string
  legs: TradeRoute[]
  totalProfit: number
  totalInvestment: number
  finalCapital: number
  systems: string[]
  sources: string[]
}

export const DEFAULT_FILTERS: RouteFilters = Object.freeze({
  capacity: 96,
  budget: 1_000_000,
  systemFrom: 'all',
  systemTo: 'all',
  terminalFrom: 'all',
  terminalTo: 'all',
  commodityKey: 'all',
  onlyLegal: false,
  onlySameSystem: false,
  requireKnownAvailability: true,
  minProfit: 0,
  minRoi: 0,
  minProfitPerScu: 0,
  maxAgeHours: 0,
  maxDistanceGm: 0,
  containerSize: 0,
  search: '',
  sort: 'profit',
  favoritesOnly: false,
})

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value) || 0)
}

export function ageHours(ts: number, nowSeconds = Date.now() / 1000): number {
  if (!ts) return Number.POSITIVE_INFINITY
  return Math.max(0, (nowSeconds - ts) / 3600)
}

export function formatAge(ts: number): string {
  if (!ts) return 'нет данных'
  const hours = ageHours(ts)
  if (hours < 1) return 'меньше часа назад'
  if (hours < 24) return `${Math.floor(hours)} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} дн назад`
  return `${Math.floor(days / 30)} мес назад`
}

export function systemsOf(terminals: Terminal[]): string[] {
  return [...new Set(terminals.map((t) => t.system).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
}

export function terminalsOf(terminals: Terminal[], system: string): Terminal[] {
  return terminals.filter((t) => system === 'all' || t.system === system).sort((a, b) => a.name.localeCompare(b.name))
}

function normalize(value = ''): string {
  return String(value).normalize('NFKD').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function latestByRouteSide(listings: Listing[]): Listing[] {
  const map = new Map<string, Listing>()
  for (const listing of listings) {
    if (!listing?.commodityKey || !listing?.locationKey || !(listing.price > 0)) continue
    const key = `${listing.commodityKey}|${listing.locationKey}|${listing.action}|${listing.source || 'unknown'}`
    const prev = map.get(key)
    if (!prev || Number(listing.updatedAt || 0) > Number(prev.updatedAt || 0)) map.set(key, listing)
  }
  return [...map.values()]
}

function indexes(snapshot: TradeSnapshot) {
  const terminals = new Map(snapshot.terminals.map((x) => [x.key, x]))
  const commodities = new Map(snapshot.commodities.map((x) => [x.key, x]))
  const distances = new Map<string, number>()
  for (const d of snapshot.distances || []) {
    if (!d.fromKey || !d.toKey || !(Number(d.distanceGm) >= 0)) continue
    distances.set(`${d.fromKey}|${d.toKey}`, Number(d.distanceGm))
    distances.set(`${d.toKey}|${d.fromKey}`, Number(d.distanceGm))
  }
  return { terminals, commodities, distances }
}

export function buildSystemPath(snapshot: TradeSnapshot, fromSystem: string, toSystem: string): RoutePath {
  if (!fromSystem || !toSystem || fromSystem === toSystem) return { systems: fromSystem ? [fromSystem] : [], jumps: [], jumpCount: 0 }
  const graph = new Map<string, Set<string>>()
  const edges = new Map<string, RoutePath['jumps'][number]>()
  const add = (a: string, b: string, edge: RoutePath['jumps'][number]) => {
    if (!graph.has(a)) graph.set(a, new Set())
    graph.get(a)!.add(b)
    edges.set(`${a}|${b}`, edge)
  }
  for (const jp of snapshot.jumpPoints || []) {
    add(jp.from, jp.to, jp)
    add(jp.to, jp.from, { ...jp, from: jp.to, to: jp.from, fromOrbit: jp.toOrbit, toOrbit: jp.fromOrbit })
  }
  const fallbacks = [
    ['Stanton', 'Pyro', 'Stanton Gateway', 'Pyro Gateway'],
    ['Pyro', 'Nyx', 'Pyro Gateway', 'Nyx Gateway'],
  ] as const
  for (const [a, b, ao, bo] of fallbacks) {
    if (!edges.has(`${a}|${b}`)) add(a, b, { from: a, to: b, fromOrbit: ao, toOrbit: bo, source: 'fallback' })
    if (!edges.has(`${b}|${a}`)) add(b, a, { from: b, to: a, fromOrbit: bo, toOrbit: ao, source: 'fallback' })
  }
  const queue: string[][] = [[fromSystem]]
  const visited = new Set([fromSystem])
  while (queue.length) {
    const path = queue.shift()!
    const last = path[path.length - 1]
    for (const next of graph.get(last) || []) {
      if (visited.has(next)) continue
      const nextPath = [...path, next]
      if (next === toSystem) {
        const jumps = nextPath.slice(0, -1).map((sys, i) => edges.get(`${sys}|${nextPath[i + 1]}`)!).filter(Boolean)
        return { systems: nextPath, jumps, jumpCount: jumps.length }
      }
      visited.add(next)
      queue.push(nextPath)
    }
  }
  return { systems: [fromSystem, toSystem], jumps: [], jumpCount: null }
}

function supportsContainer(size: number, terminal: Terminal, listing: Listing): boolean {
  if (!(size > 0)) return true
  if (listing.boxSizes?.length && !listing.boxSizes.map(Number).includes(size)) return false
  if (Number(terminal.maxContainerSize || 0) > 0 && Number(terminal.maxContainerSize) < size) return false
  return true
}

function routeSearchMatch(route: TradeRoute, needle: string): boolean {
  if (!needle.trim()) return true
  const haystack = normalize([route.commodity.name, route.from.name, route.from.location, route.from.system, route.to.name, route.to.location, route.to.system].join(' '))
  const query = normalize(needle)
  return haystack.includes(query) || haystack.replace(/\s/g, '').includes(query.replace(/\s/g, ''))
}

function compare(sort: SortKey) {
  const fns: Record<SortKey, (a: TradeRoute, b: TradeRoute) => number> = {
    profit: (a, b) => b.profit - a.profit,
    profitPerScu: (a, b) => b.profitPerScu - a.profitPerScu,
    margin: (a, b) => b.margin - a.margin,
    roi: (a, b) => b.roi - a.roi,
    freshness: (a, b) => b.freshnessAt - a.freshnessAt,
    distance: (a, b) => (a.distanceGm ?? Number.POSITIVE_INFINITY) - (b.distanceGm ?? Number.POSITIVE_INFINITY),
  }
  return fns[sort]
}

export function computeRoutes(snapshot: TradeSnapshot, filters: RouteFilters, favorites = new Set<string>()): TradeRoute[] {
  const idx = indexes(snapshot)
  const latest = latestByRouteSide(snapshot.listings || [])
  const sellers = new Map<string, Listing[]>()
  const buyers = new Map<string, Listing[]>()
  for (const listing of latest) {
    const target = listing.action === 'SELLS' ? sellers : listing.action === 'BUYS' ? buyers : null
    if (!target) continue
    const arr = target.get(listing.commodityKey) || []
    arr.push(listing)
    target.set(listing.commodityKey, arr)
  }
  const dedup = new Map<string, TradeRoute>()
  for (const [commodityKey, origins] of sellers) {
    if (filters.commodityKey !== 'all' && commodityKey !== filters.commodityKey) continue
    const commodity = idx.commodities.get(commodityKey)
    if (!commodity || (filters.onlyLegal && commodity.isIllegal)) continue
    for (const o of origins) {
      const from = idx.terminals.get(o.locationKey)
      if (!from) continue
      if (filters.systemFrom !== 'all' && from.system !== filters.systemFrom) continue
      if (filters.terminalFrom !== 'all' && from.key !== filters.terminalFrom) continue
      for (const d of buyers.get(commodityKey) || []) {
        const to = idx.terminals.get(d.locationKey)
        if (!to || to.key === from.key) continue
        if (filters.systemTo !== 'all' && to.system !== filters.systemTo) continue
        if (filters.terminalTo !== 'all' && to.key !== filters.terminalTo) continue
        const sameSystem = from.system === to.system
        if (filters.onlySameSystem && !sameSystem) continue
        const profitPerScu = Number(d.price) - Number(o.price)
        if (!(profitPerScu > 0) || profitPerScu < filters.minProfitPerScu) continue
        if (filters.maxAgeHours > 0 && (ageHours(Number(o.updatedAt || 0)) > filters.maxAgeHours || ageHours(Number(d.updatedAt || 0)) > filters.maxAgeHours)) continue
        if (!supportsContainer(filters.containerSize, from, o) || !supportsContainer(filters.containerSize, to, d)) continue
        const distanceGm = idx.distances.get(`${from.key}|${to.key}`) ?? null
        if (filters.maxDistanceGm > 0 && (distanceGm == null || distanceGm > filters.maxDistanceGm)) continue
        const capacity = Math.max(1, Math.floor(filters.capacity || 1))
        const budget = filters.budget > 0 ? filters.budget : Number.POSITIVE_INFINITY
        const budgetUnits = o.price > 0 ? Math.floor(budget / o.price) : 0
        const supplyKnown = o.quantity != null && Number.isFinite(Number(o.quantity)) && Number(o.quantity) >= 0
        const demandKnown = d.quantity != null && Number.isFinite(Number(d.quantity)) && Number(d.quantity) >= 0
        if (filters.requireKnownAvailability && (!supplyKnown || !demandKnown)) continue
        const supply = supplyKnown ? Math.floor(Number(o.quantity)) : Number.POSITIVE_INFINITY
        const demand = demandKnown ? Math.floor(Number(d.quantity)) : Number.POSITIVE_INFINITY
        if (supply <= 0 || demand <= 0) continue
        const units = Math.max(0, Math.floor(Math.min(capacity, budgetUnits, supply, demand)))
        if (!units) continue
        const investment = units * o.price
        const revenue = units * d.price
        const profit = revenue - investment
        const roi = investment > 0 ? (profit / investment) * 100 : 0
        if (profit < filters.minProfit || roi < filters.minRoi) continue
        const key = `${commodity.key}|${from.key}|${to.key}`
        if (filters.favoritesOnly && !favorites.has(key)) continue
        let limitedBy: TradeRoute['limitedBy'] = null
        const limits: Array<[TradeRoute['limitedBy'], number]> = [['трюм', capacity], ['бюджет', budgetUnits], ['наличие', supply], ['спрос', demand]]
        limits.sort((a, b) => a[1] - b[1])
        limitedBy = limits.find(([, n]) => Math.floor(n) === units)?.[0] || null
        const buyUpdatedAt = Number(o.updatedAt || 0)
        const sellUpdatedAt = Number(d.updatedAt || 0)
        const freshnessAt = buyUpdatedAt && sellUpdatedAt ? Math.min(buyUpdatedAt, sellUpdatedAt) : (buyUpdatedAt || sellUpdatedAt)
        const route: TradeRoute = {
          key, commodity, from, to, buyPrice: o.price, sellPrice: d.price, units, investment, revenue, profit, profitPerScu,
          margin: o.price > 0 ? (profitPerScu / o.price) * 100 : 0, roi, supply: supplyKnown ? supply : null, demand: demandKnown ? demand : null,
          sameSystem, availabilityUnknown: !supplyKnown || !demandKnown, limitedBy, buyUpdatedAt, sellUpdatedAt, freshnessAt,
          stale: !freshnessAt || ageHours(freshnessAt) > 24, sources: [...new Set([o.source, d.source].filter(Boolean) as string[])],
          distanceGm, maxContainerSize: Math.min(...[Number(from.maxContainerSize || 0), Number(to.maxContainerSize || 0)].filter((n) => n > 0), Number.POSITIVE_INFINITY),
          path: buildSystemPath(snapshot, from.system, to.system), originListing: o, destinationListing: d,
        }
        if (!routeSearchMatch(route, filters.search)) continue
        const prev = dedup.get(key)
        if (!prev || route.freshnessAt > prev.freshnessAt || (route.freshnessAt === prev.freshnessAt && route.profit > prev.profit)) dedup.set(key, route)
      }
    }
  }
  return [...dedup.values()].sort(compare(filters.sort))
}

export function summarizeRoutes(routes: TradeRoute[]) {
  if (!routes.length) return null
  const top = routes.slice(0, Math.min(10, routes.length))
  return {
    best: routes[0],
    avgProfit: Math.round(top.reduce((sum, route) => sum + route.profit, 0) / top.length),
    avgMargin: top.reduce((sum, route) => sum + route.margin, 0) / top.length,
  }
}

function recalc(route: TradeRoute, budget: number, capacity: number): TradeRoute {
  const byBudget = route.buyPrice > 0 && budget > 0 ? Math.floor(budget / route.buyPrice) : Math.floor(capacity)
  const supply = route.supply == null ? Number.POSITIVE_INFINITY : route.supply
  const demand = route.demand == null ? Number.POSITIVE_INFINITY : route.demand
  const units = Math.max(0, Math.floor(Math.min(capacity, byBudget, supply, demand)))
  const investment = units * route.buyPrice
  const revenue = units * route.sellPrice
  const profit = revenue - investment
  return { ...route, units, investment, revenue, profit, roi: investment > 0 ? (profit / investment) * 100 : 0 }
}

export function computeMultiStop(routes: TradeRoute[], filters: RouteFilters, maxLegs = 2, limit = 30): MultiStopRoute[] {
  const legs = Math.max(2, Math.min(4, Number(maxLegs) || 2))
  const capacity = Math.max(1, Math.floor(filters.capacity || 1))
  const initialBudget = filters.budget > 0 ? filters.budget : 1_000_000_000
  const byOrigin = new Map<string, TradeRoute[]>()
  for (const route of routes.slice(0, 500)) {
    const arr = byOrigin.get(route.from.key) || []
    arr.push(route)
    byOrigin.set(route.from.key, arr)
  }
  const result: MultiStopRoute[] = []
  for (const start of routes.slice(0, 150)) {
    let budget = initialBudget
    const first = recalc(start, budget, capacity)
    if (!(first.profit > 0)) continue
    const chain = [first]
    const seen = new Set([first.from.key, first.to.key])
    budget += first.profit
    while (chain.length < legs) {
      const next = (byOrigin.get(chain[chain.length - 1].to.key) || []).filter((r) => !seen.has(r.to.key)).map((r) => recalc(r, budget, capacity)).filter((r) => r.profit > 0).sort((a, b) => b.profit - a.profit)[0]
      if (!next) break
      chain.push(next)
      budget += next.profit
      seen.add(next.to.key)
    }
    if (chain.length < 2) continue
    const totalProfit = chain.reduce((sum, leg) => sum + leg.profit, 0)
    result.push({ key: chain.map((x) => x.key).join('>>'), legs: chain, totalProfit, totalInvestment: chain[0].investment, finalCapital: initialBudget + totalProfit, systems: [...new Set(chain.flatMap((x) => x.path.systems))], sources: [...new Set(chain.flatMap((x) => x.sources))] })
  }
  const dedup = new Map<string, MultiStopRoute>()
  for (const r of result) if (!dedup.has(r.key) || r.totalProfit > dedup.get(r.key)!.totalProfit) dedup.set(r.key, r)
  return [...dedup.values()].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, limit)
}

export function selectedShip(ships: Ship[], id: string | number | 'custom'): Ship | undefined {
  return ships.find((ship) => String(ship.id) === String(id))
}
