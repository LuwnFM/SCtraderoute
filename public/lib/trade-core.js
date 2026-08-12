export const DEFAULT_FILTERS = Object.freeze({
  capacity: 96,
  budget: 1_000_000,
  systemFrom: 'all',
  systemTo: 'all',
  terminalFrom: 'all',
  terminalTo: 'all',
  commodity: 'all',
  onlyLegal: false,
  onlySameSystem: false,
  requireKnownAvailability: false,
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

export const SORT_OPTIONS = [
  ['profit', 'Прибыль за рейс'],
  ['profitPerScu', 'Прибыль за SCU'],
  ['roi', 'ROI, %'],
  ['margin', 'Маржа, %'],
  ['freshness', 'Свежесть данных'],
  ['distance', 'Расстояние'],
]

export function normalizeName(value = '') {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function slug(value = '') {
  return normalizeName(value).replace(/\s+/g, '-') || 'unknown'
}

export function parseTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'number') return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n)
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
}

export function ageHours(ts, nowSeconds = Date.now() / 1000) {
  if (!ts) return Number.POSITIVE_INFINITY
  return Math.max(0, (nowSeconds - ts) / 3600)
}

export function formatAge(ts) {
  if (!ts) return 'нет данных'
  const hours = ageHours(ts)
  if (hours < 1) return 'меньше часа назад'
  if (hours < 24) return `${Math.floor(hours)} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} дн назад`
  return `${Math.floor(days / 30)} мес назад`
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value) || 0)
}

export function commodityKey(value) {
  return `commodity:${slug(value)}`
}

export function terminalKey(system, location) {
  return `terminal:${slug(system)}:${slug(location)}`
}

export function systemFromLocationPath(location = '') {
  const parts = String(location).split('>').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) return parts[0]
  const lower = String(location).toLowerCase()
  for (const system of ['Stanton', 'Pyro', 'Nyx']) {
    if (lower.includes(system.toLowerCase())) return system
  }
  return 'Неизвестно'
}

export function buildIndexes(snapshot) {
  const terminals = new Map((snapshot.terminals || []).map((x) => [x.key, x]))
  const commodities = new Map((snapshot.commodities || []).map((x) => [x.key, x]))
  const ships = new Map((snapshot.ships || []).map((x) => [String(x.id), x]))
  const distances = new Map()
  for (const d of snapshot.distances || []) {
    if (!d?.fromKey || !d?.toKey || !(Number(d.distanceGm) >= 0)) continue
    distances.set(`${d.fromKey}|${d.toKey}`, Number(d.distanceGm))
    distances.set(`${d.toKey}|${d.fromKey}`, Number(d.distanceGm))
  }
  return { terminals, commodities, ships, distances }
}

function latestByRouteSide(listings) {
  const map = new Map()
  for (const listing of listings || []) {
    if (!listing?.commodityKey || !listing?.locationKey || !listing?.action || !(listing.price > 0)) continue
    const k = `${listing.commodityKey}|${listing.locationKey}|${listing.action}|${listing.source || 'unknown'}`
    const prev = map.get(k)
    if (!prev || (listing.updatedAt || 0) > (prev.updatedAt || 0)) map.set(k, listing)
  }
  return [...map.values()]
}

export function buildSystemPath(jumpPoints = [], fromSystem, toSystem) {
  if (!fromSystem || !toSystem || fromSystem === toSystem) {
    return { systems: fromSystem ? [fromSystem] : [], jumps: [], jumpCount: 0 }
  }
  const graph = new Map()
  const edges = new Map()
  const add = (a, b, edge) => {
    if (!a || !b) return
    if (!graph.has(a)) graph.set(a, new Set())
    graph.get(a).add(b)
    edges.set(`${a}|${b}`, edge)
  }
  for (const jp of jumpPoints || []) {
    add(jp.from, jp.to, jp)
    add(jp.to, jp.from, { ...jp, from: jp.to, to: jp.from, fromOrbit: jp.toOrbit, toOrbit: jp.fromOrbit })
  }
  // Fallback links keep Stanton/Pyro/Nyx useful even if a snapshot lacks jump-point metadata.
  if (!edges.has('Stanton|Pyro')) add('Stanton', 'Pyro', { from: 'Stanton', to: 'Pyro', fromOrbit: 'Stanton Gateway', toOrbit: 'Pyro Gateway', fallback: true })
  if (!edges.has('Pyro|Stanton')) add('Pyro', 'Stanton', { from: 'Pyro', to: 'Stanton', fromOrbit: 'Pyro Gateway', toOrbit: 'Stanton Gateway', fallback: true })
  if (!edges.has('Pyro|Nyx')) add('Pyro', 'Nyx', { from: 'Pyro', to: 'Nyx', fromOrbit: 'Pyro Gateway', toOrbit: 'Nyx Gateway', fallback: true })
  if (!edges.has('Nyx|Pyro')) add('Nyx', 'Pyro', { from: 'Nyx', to: 'Pyro', fromOrbit: 'Nyx Gateway', toOrbit: 'Pyro Gateway', fallback: true })

  const queue = [[fromSystem]]
  const visited = new Set([fromSystem])
  while (queue.length) {
    const path = queue.shift()
    const last = path[path.length - 1]
    for (const next of graph.get(last) || []) {
      if (visited.has(next)) continue
      const nextPath = [...path, next]
      if (next === toSystem) {
        const jumps = []
        for (let i = 0; i < nextPath.length - 1; i += 1) {
          jumps.push(edges.get(`${nextPath[i]}|${nextPath[i + 1]}`))
        }
        return { systems: nextPath, jumps, jumpCount: jumps.length }
      }
      visited.add(next)
      queue.push(nextPath)
    }
  }
  return { systems: [fromSystem, toSystem], jumps: [], jumpCount: null }
}

function sourceSummary(a, b) {
  const sources = []
  for (const s of [a?.source, b?.source]) if (s && !sources.includes(s)) sources.push(s)
  return sources
}

function sourceVariants(a, b) {
  return {
    buy: { source: a.source || 'unknown', updatedAt: a.updatedAt || 0 },
    sell: { source: b.source || 'unknown', updatedAt: b.updatedAt || 0 },
  }
}

function maxSupportedContainer(terminal, listing) {
  const values = []
  if (terminal?.maxContainerSize > 0) values.push(Number(terminal.maxContainerSize))
  if (Array.isArray(listing?.boxSizes) && listing.boxSizes.length) values.push(Math.max(...listing.boxSizes.map(Number).filter((n) => n > 0)))
  return values.length ? Math.min(...values) : 0
}

function supportsContainer(size, terminal, listing) {
  if (!(size > 0)) return true
  if (Array.isArray(listing?.boxSizes) && listing.boxSizes.length && !listing.boxSizes.map(Number).includes(Number(size))) return false
  if (terminal?.maxContainerSize > 0 && terminal.maxContainerSize < size) return false
  return true
}

function chooseLimitedBy(units, capacity, budgetUnits, supply, demand) {
  const candidates = [
    ['трюм', capacity],
    ['бюджет', budgetUnits],
    ['наличие', supply],
    ['спрос', demand],
  ].filter(([, n]) => Number.isFinite(n))
  candidates.sort((a, b) => a[1] - b[1])
  const first = candidates.find(([, n]) => Math.floor(n) === Math.floor(units))
  return first?.[0] || null
}

function routeCandidate(snapshot, indexes, commodity, originListing, destinationListing, filters) {
  const from = indexes.terminals.get(originListing.locationKey)
  const to = indexes.terminals.get(destinationListing.locationKey)
  if (!from || !to || from.key === to.key) return null
  if (filters.systemFrom !== 'all' && from.system !== filters.systemFrom) return null
  if (filters.systemTo !== 'all' && to.system !== filters.systemTo) return null
  if (filters.terminalFrom !== 'all' && from.key !== filters.terminalFrom) return null
  if (filters.terminalTo !== 'all' && to.key !== filters.terminalTo) return null
  if (filters.onlySameSystem && from.system !== to.system) return null

  const profitPerScu = Number(destinationListing.price) - Number(originListing.price)
  if (!(profitPerScu > 0)) return null
  if (profitPerScu < Number(filters.minProfitPerScu || 0)) return null

  if (filters.maxAgeHours > 0) {
    if (ageHours(originListing.updatedAt) > filters.maxAgeHours || ageHours(destinationListing.updatedAt) > filters.maxAgeHours) return null
  }

  if (filters.containerSize > 0) {
    if (!supportsContainer(filters.containerSize, from, originListing) || !supportsContainer(filters.containerSize, to, destinationListing)) return null
  }

  const distanceGm = indexes.distances.get(`${from.key}|${to.key}`) ?? null
  if (filters.maxDistanceGm > 0 && (distanceGm == null || distanceGm > filters.maxDistanceGm)) return null

  const capacity = Math.max(1, Math.floor(Number(filters.capacity) || 1))
  const budget = Number(filters.budget) > 0 ? Number(filters.budget) : Number.POSITIVE_INFINITY
  const budgetUnits = Number(originListing.price) > 0 ? Math.floor(budget / Number(originListing.price)) : 0
  const supplyKnown = Number.isFinite(Number(originListing.quantity)) && Number(originListing.quantity) >= 0
  const demandKnown = Number.isFinite(Number(destinationListing.quantity)) && Number(destinationListing.quantity) >= 0
  if (filters.requireKnownAvailability && (!supplyKnown || !demandKnown)) return null
  if (supplyKnown && Number(originListing.quantity) <= 0) return null
  if (demandKnown && Number(destinationListing.quantity) <= 0) return null
  const supply = supplyKnown ? Math.floor(Number(originListing.quantity)) : Number.POSITIVE_INFINITY
  const demand = demandKnown ? Math.floor(Number(destinationListing.quantity)) : Number.POSITIVE_INFINITY
  const units = Math.max(0, Math.floor(Math.min(capacity, budgetUnits, supply, demand)))
  if (!(units > 0)) return null

  const investment = units * Number(originListing.price)
  const revenue = units * Number(destinationListing.price)
  const profit = revenue - investment
  const roi = investment > 0 ? (profit / investment) * 100 : 0
  const margin = Number(originListing.price) > 0 ? (profitPerScu / Number(originListing.price)) * 100 : 0
  if (profit < Number(filters.minProfit || 0) || roi < Number(filters.minRoi || 0)) return null

  const buyUpdatedAt = originListing.updatedAt || 0
  const sellUpdatedAt = destinationListing.updatedAt || 0
  const freshnessAt = buyUpdatedAt && sellUpdatedAt ? Math.min(buyUpdatedAt, sellUpdatedAt) : (buyUpdatedAt || sellUpdatedAt || 0)
  const path = buildSystemPath(snapshot.jumpPoints || [], from.system, to.system)
  const maxContainerSize = Math.min(
    ...[maxSupportedContainer(from, originListing), maxSupportedContainer(to, destinationListing)].filter((n) => n > 0),
  )

  return {
    key: `${commodity.key}|${from.key}|${to.key}`,
    commodity,
    from,
    to,
    buyPrice: Number(originListing.price),
    sellPrice: Number(destinationListing.price),
    units,
    investment,
    revenue,
    profit,
    profitPerScu,
    roi,
    margin,
    supply: supplyKnown ? supply : null,
    demand: demandKnown ? demand : null,
    availabilityUnknown: !supplyKnown || !demandKnown,
    limitedBy: chooseLimitedBy(units, capacity, budgetUnits, supply, demand),
    buyUpdatedAt,
    sellUpdatedAt,
    freshnessAt,
    stale: freshnessAt ? ageHours(freshnessAt) > 24 : true,
    sources: sourceSummary(originListing, destinationListing),
    sourceVariants: sourceVariants(originListing, destinationListing),
    distanceGm,
    maxContainerSize: Number.isFinite(maxContainerSize) ? maxContainerSize : 0,
    path,
    originListing,
    destinationListing,
  }
}

function routeSearchMatch(route, needle) {
  if (!needle) return true
  const haystack = normalizeName([
    route.commodity.name,
    route.from.name,
    route.from.location,
    route.from.system,
    route.to.name,
    route.to.location,
    route.to.system,
  ].join(' '))
  const normalizedNeedle = normalizeName(needle)
  return haystack.includes(normalizedNeedle) || haystack.replace(/\s/g, '').includes(normalizedNeedle.replace(/\s/g, ''))
}

function compareRoutes(sort) {
  const map = {
    profit: (a, b) => b.profit - a.profit,
    profitPerScu: (a, b) => b.profitPerScu - a.profitPerScu,
    roi: (a, b) => b.roi - a.roi,
    margin: (a, b) => b.margin - a.margin,
    freshness: (a, b) => (b.freshnessAt || 0) - (a.freshnessAt || 0),
    distance: (a, b) => (a.distanceGm ?? Number.POSITIVE_INFINITY) - (b.distanceGm ?? Number.POSITIVE_INFINITY),
  }
  return map[sort] || map.profit
}

export function computeRoutes(snapshot, filters = DEFAULT_FILTERS, favorites = new Set()) {
  const f = { ...DEFAULT_FILTERS, ...filters }
  const indexes = buildIndexes(snapshot)
  const latest = latestByRouteSide(snapshot.listings || [])
  const sellers = new Map()
  const buyers = new Map()
  for (const listing of latest) {
    const target = listing.action === 'SELLS' ? sellers : listing.action === 'BUYS' ? buyers : null
    if (!target) continue
    if (!target.has(listing.commodityKey)) target.set(listing.commodityKey, [])
    target.get(listing.commodityKey).push(listing)
  }

  const dedup = new Map()
  for (const [key, origins] of sellers) {
    if (f.commodity !== 'all' && key !== f.commodity) continue
    const commodity = indexes.commodities.get(key) || { key, name: origins[0]?.commodityName || key, isIllegal: false }
    if (f.onlyLegal && commodity.isIllegal) continue
    const destinations = buyers.get(key) || []
    for (const o of origins) {
      for (const d of destinations) {
        const route = routeCandidate(snapshot, indexes, commodity, o, d, f)
        if (!route || !routeSearchMatch(route, f.search)) continue
        if (f.favoritesOnly && !favorites.has(route.key)) continue
        const prev = dedup.get(route.key)
        if (!prev || route.freshnessAt > prev.freshnessAt || (route.freshnessAt === prev.freshnessAt && route.profit > prev.profit)) {
          dedup.set(route.key, route)
        }
      }
    }
  }
  return [...dedup.values()].sort(compareRoutes(f.sort))
}

export function recalcRouteForBudget(route, budget, capacity) {
  const byBudget = route.buyPrice > 0 && budget > 0 ? Math.floor(budget / route.buyPrice) : Math.floor(capacity)
  const supply = route.supply == null ? Number.POSITIVE_INFINITY : route.supply
  const demand = route.demand == null ? Number.POSITIVE_INFINITY : route.demand
  const units = Math.max(0, Math.floor(Math.min(capacity, byBudget, supply, demand)))
  const investment = units * route.buyPrice
  const revenue = units * route.sellPrice
  const profit = revenue - investment
  return { ...route, units, investment, revenue, profit, roi: investment > 0 ? (profit / investment) * 100 : 0 }
}

export function computeMultiStop(routes, filters, maxLegs = 2, limit = 60) {
  const legs = Math.max(2, Math.min(4, Number(maxLegs) || 2))
  const capacity = Math.max(1, Math.floor(Number(filters.capacity) || 1))
  const initialBudget = Number(filters.budget) > 0 ? Number(filters.budget) : 1_000_000_000
  const byOrigin = new Map()
  for (const route of routes.slice(0, 500)) {
    if (!byOrigin.has(route.from.key)) byOrigin.set(route.from.key, [])
    byOrigin.get(route.from.key).push(route)
  }
  const results = []

  for (const start of routes.slice(0, 150)) {
    const seen = new Set([start.from.key])
    let budget = initialBudget
    let current = recalcRouteForBudget(start, budget, capacity)
    if (!(current.profit > 0)) continue
    const chain = [current]
    budget += current.profit
    seen.add(current.to.key)

    while (chain.length < legs) {
      const candidates = (byOrigin.get(chain[chain.length - 1].to.key) || [])
        .filter((r) => !seen.has(r.to.key))
        .map((r) => recalcRouteForBudget(r, budget, capacity))
        .filter((r) => r.profit > 0)
        .sort((a, b) => b.profit - a.profit)
      if (!candidates.length) break
      current = candidates[0]
      chain.push(current)
      budget += current.profit
      seen.add(current.to.key)
    }
    if (chain.length < 2) continue
    const totalProfit = chain.reduce((sum, x) => sum + x.profit, 0)
    const totalInvestment = chain[0].investment
    results.push({
      key: chain.map((x) => x.key).join('>>'),
      legs: chain,
      totalProfit,
      totalInvestment,
      finalCapital: initialBudget + totalProfit,
      systems: [...new Set(chain.flatMap((x) => x.path.systems || [x.from.system, x.to.system]))],
      sources: [...new Set(chain.flatMap((x) => x.sources))],
    })
  }

  const dedup = new Map()
  for (const r of results) if (!dedup.has(r.key) || r.totalProfit > dedup.get(r.key).totalProfit) dedup.set(r.key, r)
  return [...dedup.values()].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, limit)
}

export function summarizeRoutes(routes) {
  if (!routes.length) return null
  const top = routes.slice(0, Math.min(10, routes.length))
  return {
    best: routes[0],
    avgProfit: Math.round(top.reduce((s, r) => s + r.profit, 0) / top.length),
    avgRoi: top.reduce((s, r) => s + r.roi, 0) / top.length,
  }
}
