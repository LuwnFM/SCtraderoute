import {
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  computeRoutes,
  computeMultiStop,
  formatAge,
  formatNumber,
  summarizeRoutes,
} from './lib/trade-core.js'

const BASE = new URL('.', import.meta.url)
const DATA_URL = new URL('./data/trade-snapshot.json', BASE)
const FILTERS_KEY = 'cargonav-filters-v3'
const FAVORITES_KEY = 'cargonav-favorites-v1'
const PRESETS_KEY = 'cargonav-presets-v1'
const SHIP_KEY = 'cargonav-ship-v1'

const state = {
  snapshot: null,
  filters: loadJson(FILTERS_KEY, { ...DEFAULT_FILTERS }),
  favorites: new Set(loadJson(FAVORITES_KEY, [])),
  presets: loadJson(PRESETS_KEY, []),
  selectedShipId: loadJson(SHIP_KEY, 'custom'),
  routes: [],
  multiRoutes: [],
  mode: 'single',
  maxStops: 2,
  visible: 25,
  currentDetail: null,
  loading: true,
  error: null,
}

const $ = (id) => document.getElementById(id)

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function numberInput(id, fallback = 0) {
  const n = Number($(id)?.value)
  return Number.isFinite(n) ? n : fallback
}

function setStatus(message, kind = 'neutral') {
  const el = $('data-status')
  if (!el) return
  el.textContent = message
  el.dataset.kind = kind
}

async function loadSnapshot({ bust = false } = {}) {
  state.loading = true
  state.error = null
  setStatus('загрузка торговых данных…')
  try {
    const url = new URL(DATA_URL)
    if (bust) url.searchParams.set('t', Date.now())
    const res = await fetch(url, { cache: bust ? 'no-store' : 'default' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const snapshot = await res.json()
    if (!Array.isArray(snapshot.listings) || !Array.isArray(snapshot.terminals)) throw new Error('некорректный trade-snapshot.json')
    state.snapshot = snapshot
    state.loading = false
    hydrateControls()
    renderAll()
    const ok = (snapshot.meta?.sourceReports || []).filter((x) => x.ok).map((x) => x.name)
    setStatus(ok.length ? `источники: ${ok.join(' + ')}` : 'показан сохранённый snapshot', ok.length ? 'good' : 'warn')
  } catch (error) {
    state.loading = false
    state.error = error instanceof Error ? error.message : String(error)
    setStatus(`ошибка: ${state.error}`, 'bad')
    renderRoutes()
  }
}

function option(value, label, selected) {
  return `<option value="${safeText(value)}"${String(value) === String(selected) ? ' selected' : ''}>${safeText(label)}</option>`
}

function uniqueSystems() {
  return [...new Set((state.snapshot?.terminals || []).map((x) => x.system).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
}

function activeShips() {
  return (state.snapshot?.ships || [])
    .filter((s) => s.scu > 0 && !s.isGroundVehicle && !s.isConcept && s.isSpaceship !== false)
    .sort((a, b) => a.scu - b.scu || a.name.localeCompare(b.name))
}

function hydrateControls() {
  if (!state.snapshot) return
  const systems = uniqueSystems()
  for (const id of ['system-from', 'system-to']) {
    const current = id === 'system-from' ? state.filters.systemFrom : state.filters.systemTo
    $(id).innerHTML = option('all', 'Любая', current) + systems.map((s) => option(s, s, current)).join('')
  }

  const commodities = [...(state.snapshot.commodities || [])].sort((a, b) => a.name.localeCompare(b.name))
  $('commodity').innerHTML = option('all', 'Все товары', state.filters.commodity) + commodities.map((c) => option(c.key, `${c.name}${c.isIllegal ? ' · контрабанда' : ''}`, state.filters.commodity)).join('')

  const ships = activeShips()
  $('ship').innerHTML = option('custom', 'Свой объём трюма', state.selectedShipId) + ships.map((s) => option(s.id, `${s.name} — ${formatNumber(s.scu)} SCU`, state.selectedShipId)).join('')

  fillTerminalSelects()
  fillPresetSelect()
  syncControlValues()
  renderHeroStats()
  renderFleet()
  renderSourceReport()
}

function fillTerminalSelects() {
  const terminals = state.snapshot?.terminals || []
  const from = terminals.filter((t) => state.filters.systemFrom === 'all' || t.system === state.filters.systemFrom)
  const to = terminals.filter((t) => state.filters.systemTo === 'all' || t.system === state.filters.systemTo)
  $('terminal-from').innerHTML = option('all', 'Любая точка', state.filters.terminalFrom) + from.map((t) => option(t.key, `${t.name} · ${t.system}`, state.filters.terminalFrom)).join('')
  $('terminal-to').innerHTML = option('all', 'Любая точка', state.filters.terminalTo) + to.map((t) => option(t.key, `${t.name} · ${t.system}`, state.filters.terminalTo)).join('')
  if (state.filters.terminalFrom !== 'all' && !from.some((t) => t.key === state.filters.terminalFrom)) state.filters.terminalFrom = 'all'
  if (state.filters.terminalTo !== 'all' && !to.some((t) => t.key === state.filters.terminalTo)) state.filters.terminalTo = 'all'
}

function syncControlValues() {
  const f = state.filters
  const pairs = {
    capacity: f.capacity,
    budget: f.budget,
    'system-from': f.systemFrom,
    'system-to': f.systemTo,
    'terminal-from': f.terminalFrom,
    'terminal-to': f.terminalTo,
    commodity: f.commodity,
    search: f.search,
    sort: f.sort,
    'min-profit': f.minProfit,
    'min-roi': f.minRoi,
    'min-profit-scu': f.minProfitPerScu,
    'max-age': f.maxAgeHours,
    'max-distance': f.maxDistanceGm,
    'container-size': f.containerSize,
  }
  for (const [id, value] of Object.entries(pairs)) if ($(id)) $(id).value = String(value)
  $('only-legal').checked = !!f.onlyLegal
  $('same-system').checked = !!f.onlySameSystem
  $('known-availability').checked = !!f.requireKnownAvailability
  $('favorites-only').checked = !!f.favoritesOnly
  $('max-stops').value = String(state.maxStops)
  $('mode-single').classList.toggle('is-active', state.mode === 'single')
  $('mode-multi').classList.toggle('is-active', state.mode === 'multi')
  $('multi-options').hidden = state.mode !== 'multi'
}

function patchFilters(patch) {
  state.filters = { ...state.filters, ...patch }
  state.visible = 25
  saveJson(FILTERS_KEY, state.filters)
  if ('systemFrom' in patch || 'systemTo' in patch) fillTerminalSelects()
  renderAll()
}

function selectedShip() {
  if (state.selectedShipId === 'custom') return null
  return (state.snapshot?.ships || []).find((s) => String(s.id) === String(state.selectedShipId)) || null
}

function routeCompatibleWithSelectedShip(route) {
  const ship = selectedShip()
  const requested = Number(state.filters.containerSize || 0)
  if (!ship || !requested) return true
  if (Array.isArray(ship.containerSizes) && ship.containerSizes.length && !ship.containerSizes.map(Number).includes(requested)) return false
  if (route.maxContainerSize > 0 && route.maxContainerSize < requested) return false
  return true
}

function renderAll() {
  if (!state.snapshot) return
  state.routes = computeRoutes(state.snapshot, state.filters, state.favorites).filter(routeCompatibleWithSelectedShip)
  state.multiRoutes = computeMultiStop(state.routes, state.filters, state.maxStops)
  renderSummary()
  renderRoutes()
  renderFoundCount()
  syncControlValues()
}

function renderHeroStats() {
  const s = state.snapshot
  $('stat-terminals').textContent = formatNumber(s.terminals?.length || 0)
  $('stat-commodities').textContent = formatNumber(s.commodities?.length || 0)
  $('stat-ships').textContent = formatNumber(activeShips().length)
  const generated = s.meta?.generatedAt ? new Date(s.meta.generatedAt) : null
  $('snapshot-time').textContent = generated && !Number.isNaN(generated.getTime()) ? generated.toLocaleString('ru-RU') : 'неизвестно'
  $('hero-source').textContent = (s.meta?.sourceReports || []).some((x) => x.name === 'SC Trade Tools' && x.ok)
    ? 'UEX + SC Trade Tools'
    : 'UEX + резервный snapshot'
}

function renderSourceReport() {
  const reports = state.snapshot?.meta?.sourceReports || []
  $('source-report').innerHTML = reports.map((r) => `<li><span class="source-dot ${r.ok ? 'ok' : 'fail'}"></span><strong>${safeText(r.name)}</strong> — ${safeText(r.note || (r.ok ? 'ok' : 'недоступен'))}</li>`).join('')
}

function renderFoundCount() {
  const count = state.mode === 'single' ? state.routes.length : state.multiRoutes.length
  $('found-count').textContent = formatNumber(count)
}

function renderSummary() {
  const summary = summarizeRoutes(state.routes)
  const box = $('summary')
  if (!summary) { box.innerHTML = ''; return }
  box.innerHTML = `
    <div class="metric"><span>Лучший рейс</span><strong class="success">+${formatNumber(summary.best.profit)}</strong><small>${safeText(summary.best.commodity.name)} · ${safeText(summary.best.from.name)} → ${safeText(summary.best.to.name)}</small></div>
    <div class="metric"><span>Средняя прибыль топ-10</span><strong>${formatNumber(summary.avgProfit)}</strong><small>aUEC за рейс</small></div>
    <div class="metric"><span>Средний ROI топ-10</span><strong class="accent">${summary.avgRoi.toFixed(1)}%</strong><small>к вложенному капиталу</small></div>`
}

function freshnessBadge(route) {
  const age = route.freshnessAt ? Math.floor((Date.now() / 1000 - route.freshnessAt) / 3600) : Infinity
  if (!Number.isFinite(age)) return '<span class="badge danger">дата неизвестна</span>'
  if (age <= 6) return '<span class="badge good">свежие цены</span>'
  if (age <= 24) return '<span class="badge">до суток</span>'
  return '<span class="badge warn">устаревшие данные</span>'
}

function sourceBadges(route) {
  return (route.sources || []).map((s) => `<span class="badge source">${safeText(s)}</span>`).join('')
}

function pathLabel(route) {
  if (route.sameSystem || route.path?.jumpCount === 0) return safeText(route.from.system)
  const systems = route.path?.systems?.length ? route.path.systems : [route.from.system, route.to.system]
  return `${safeText(systems.join(' → '))}${route.path?.jumpCount != null ? ` · ${route.path.jumpCount} jump` : ''}`
}

function singleRouteCard(route, i) {
  const fav = state.favorites.has(route.key)
  const distance = route.distanceGm != null ? `${formatNumber(route.distanceGm, 1)} GM` : 'расстояние н/д'
  return `<article class="route-card" data-route-key="${safeText(route.key)}">
    <div class="route-rank">${String(i + 1).padStart(2, '0')}</div>
    <div class="route-main">
      <div class="route-title-row">
        <h3>${safeText(route.commodity.name)}</h3>
        ${route.commodity.isIllegal ? '<span class="badge danger">контрабанда</span>' : ''}
        ${route.from.system !== route.to.system ? '<span class="badge">межсистемный</span>' : ''}
        ${freshnessBadge(route)}${sourceBadges(route)}
      </div>
      <div class="route-points">
        <div><b>↓ ${safeText(route.from.name)}</b><span>${safeText(route.from.location)} · ${safeText(route.from.system)}</span><small>покупка ${formatNumber(route.buyPrice)} aUEC/SCU · ${formatAge(route.buyUpdatedAt)}</small></div>
        <div><b>↑ ${safeText(route.to.name)}</b><span>${safeText(route.to.location)} · ${safeText(route.to.system)}</span><small>продажа ${formatNumber(route.sellPrice)} aUEC/SCU · ${formatAge(route.sellUpdatedAt)}</small></div>
      </div>
      <div class="route-meta"><span>${pathLabel(route)}</span><span>${distance}</span>${route.availabilityUnknown ? '<span class="warning-text">supply/demand частично неизвестны</span>' : ''}</div>
    </div>
    <div class="route-profit"><small>Чистая прибыль</small><strong>+${formatNumber(route.profit)}</strong><span>${formatNumber(route.units)} SCU · ROI ${route.roi.toFixed(1)}%</span><div class="route-actions"><button class="icon-btn favorite" title="Избранное" aria-label="Избранное" data-favorite="${safeText(route.key)}">${fav ? '★' : '☆'}</button><button class="small-btn" data-detail="${safeText(route.key)}">Разбор рейса</button></div></div>
  </article>`
}

function multiRouteCard(chain, i) {
  return `<article class="route-card multi-card">
    <div class="route-rank">${String(i + 1).padStart(2, '0')}</div>
    <div class="route-main"><div class="route-title-row"><h3>${chain.legs.length}-этапный рейс</h3>${chain.sources.map((s) => `<span class="badge source">${safeText(s)}</span>`).join('')}</div>
    <ol class="multi-legs">${chain.legs.map((leg, idx) => `<li><span>${idx + 1}</span><div><b>${safeText(leg.from.name)} → ${safeText(leg.to.name)}</b><small>${safeText(leg.commodity.name)} · ${formatNumber(leg.units)} SCU · +${formatNumber(leg.profit)} aUEC</small></div></li>`).join('')}</ol></div>
    <div class="route-profit"><small>Итоговая прибыль</small><strong>+${formatNumber(chain.totalProfit)}</strong><span>${chain.legs.length} остановки/этапа</span></div>
  </article>`
}

function renderRoutes() {
  const list = $('route-list')
  if (state.loading) { list.innerHTML = '<div class="empty-state">Загрузка данных…</div>'; return }
  if (state.error) { list.innerHTML = `<div class="empty-state"><b>Не удалось загрузить snapshot</b><span>${safeText(state.error)}</span><button class="small-btn" id="retry-load">Повторить</button></div>`; $('retry-load')?.addEventListener('click', () => loadSnapshot({ bust: true })); return }

  const rows = state.mode === 'single' ? state.routes : state.multiRoutes
  if (!rows.length) { list.innerHTML = '<div class="empty-state"><b>Маршрутов не найдено</b><span>Ослабьте фильтры, увеличьте бюджет/SCU или снимите ограничение свежести.</span></div>'; return }
  const visible = rows.slice(0, state.visible)
  list.innerHTML = visible.map((r, i) => state.mode === 'single' ? singleRouteCard(r, i) : multiRouteCard(r, i)).join('')
  $('load-more-wrap').hidden = state.visible >= rows.length
  $('load-more').textContent = `Показать ещё ${Math.min(25, rows.length - state.visible)}`
  list.querySelectorAll('[data-favorite]').forEach((btn) => btn.addEventListener('click', () => toggleFavorite(btn.dataset.favorite)))
  list.querySelectorAll('[data-detail]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.detail)))
}

function toggleFavorite(key) {
  if (state.favorites.has(key)) state.favorites.delete(key); else state.favorites.add(key)
  saveJson(FAVORITES_KEY, [...state.favorites])
  renderAll()
}

function openDetail(key) {
  const route = state.routes.find((r) => r.key === key)
  if (!route) return
  state.currentDetail = route
  const dialog = $('detail-dialog')
  $('detail-title').textContent = route.commodity.name
  $('detail-subtitle').textContent = `${route.from.name} → ${route.to.name}`
  $('detail-grid').innerHTML = [
    ['Груз', `${formatNumber(route.units)} SCU`],
    ['Вложения', `${formatNumber(route.investment)} aUEC`],
    ['Выручка', `${formatNumber(route.revenue)} aUEC`],
    ['Прибыль', `+${formatNumber(route.profit)} aUEC`],
    ['Прибыль/SCU', `${formatNumber(route.profitPerScu)} aUEC`],
    ['ROI', `${route.roi.toFixed(1)}%`],
    ['Supply', route.supply == null ? 'нет данных' : `${formatNumber(route.supply)} SCU`],
    ['Demand', route.demand == null ? 'нет данных' : `${formatNumber(route.demand)} SCU`],
    ['Цена покупки', `${formatAge(route.buyUpdatedAt)} · ${safeText(route.sourceVariants.buy.source)}`],
    ['Цена продажи', `${formatAge(route.sellUpdatedAt)} · ${safeText(route.sourceVariants.sell.source)}`],
    ['Ограничение', route.limitedBy || 'нет'],
    ['Контейнер', route.maxContainerSize > 0 ? `до ${formatNumber(route.maxContainerSize)} SCU` : 'нет данных'],
  ].map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')
  $('detail-path').textContent = route.from.system === route.to.system
    ? `Внутрисистемный маршрут: ${route.from.system}`
    : `Путь: ${(route.path?.systems || [route.from.system, route.to.system]).join(' → ')}${route.path?.jumpCount != null ? ` · переходов: ${route.path.jumpCount}` : ''}`
  $('detail-distance').textContent = route.distanceGm != null ? `Оценка расстояния: ${formatNumber(route.distanceGm, 1)} GM` : 'Оценка расстояния для этой пары пока отсутствует в snapshot.'
  $('history-panel').innerHTML = '<p class="muted">Нажмите «История цены», чтобы запросить реальные исторические данные UEX для этой торговой точки.</p>'
  $('history-button').disabled = !(route.commodity.uexId && route.from.uexId && route.to.uexId)
  dialog.showModal()
}

function closeDetail() { $('detail-dialog')?.close(); state.currentDetail = null }

async function loadHistory() {
  const route = state.currentDetail
  if (!route?.commodity?.uexId) return
  const panel = $('history-panel')
  panel.innerHTML = '<p class="muted">Загрузка истории UEX…</p>'
  try {
    const [buy, sell] = await Promise.all([
      fetchUexHistory(route.from.uexId, route.commodity.uexId),
      fetchUexHistory(route.to.uexId, route.commodity.uexId),
    ])
    panel.innerHTML = renderHistoryChart(buy, sell)
  } catch (error) {
    panel.innerHTML = `<p class="warning-text">Историю не удалось получить: ${safeText(error instanceof Error ? error.message : String(error))}. Текущий маршрут при этом остаётся рассчитан по snapshot.</p>`
  }
}

async function fetchUexHistory(terminalId, commodityId) {
  const url = `https://api.uexcorp.space/2.0/commodities_prices_history?id_terminal=${encodeURIComponent(terminalId)}&id_commodity=${encodeURIComponent(commodityId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`UEX HTTP ${res.status}`)
  const json = await res.json()
  if (json.status !== 'ok' || !Array.isArray(json.data)) throw new Error('UEX вернул неожиданный ответ')
  return json.data
}

function renderHistoryChart(buyRows, sellRows) {
  const points = []
  for (const row of buyRows) if (Number(row.price_buy) > 0 && Number(row.date_added) > 0) points.push({ t: Number(row.date_added), v: Number(row.price_buy), kind: 'buy' })
  for (const row of sellRows) if (Number(row.price_sell) > 0 && Number(row.date_added) > 0) points.push({ t: Number(row.date_added), v: Number(row.price_sell), kind: 'sell' })
  if (points.length < 2) return '<p class="muted">Недостаточно исторических данных для графика.</p>'
  points.sort((a, b) => a.t - b.t)
  const minT = points[0].t, maxT = points[points.length - 1].t
  const values = points.map((p) => p.v)
  const minV = Math.min(...values), maxV = Math.max(...values)
  const W = 720, H = 220, P = 24
  const x = (t) => P + ((t - minT) / Math.max(1, maxT - minT)) * (W - P * 2)
  const y = (v) => H - P - ((v - minV) / Math.max(1, maxV - minV)) * (H - P * 2)
  const pathFor = (kind) => points.filter((p) => p.kind === kind).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  return `<div class="history-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="История цен UEX"><path class="grid-line" d="M${P},${H-P} H${W-P}"/><path class="history-buy" d="${pathFor('buy')}"/><path class="history-sell" d="${pathFor('sell')}"/></svg><div class="history-legend"><span><i class="buy"></i>покупка на origin</span><span><i class="sell"></i>продажа на destination</span><span>${formatNumber(minV)}–${formatNumber(maxV)} aUEC/SCU</span></div></div>`
}

function renderFleet() {
  const ships = activeShips()
  const needle = ($('fleet-search')?.value || '').trim().toLowerCase()
  const filtered = ships.filter((s) => !needle || `${s.name} ${s.manufacturer}`.toLowerCase().includes(needle))
  $('fleet-grid').innerHTML = filtered.slice(0, 36).map((s) => `<button class="ship-card${String(state.selectedShipId) === String(s.id) ? ' active' : ''}" data-ship-card="${safeText(s.id)}"><span><b>${safeText(s.name)}</b><small>${safeText(s.manufacturer || '—')}${s.containerSizes?.length ? ` · контейнеры ${s.containerSizes.join('/')}` : ''}</small></span><strong>${formatNumber(s.scu)}<small>SCU</small></strong></button>`).join('')
  $('fleet-grid').querySelectorAll('[data-ship-card]').forEach((b) => b.addEventListener('click', () => selectShip(b.dataset.shipCard)))
}

function selectShip(id) {
  state.selectedShipId = id
  saveJson(SHIP_KEY, id)
  const ship = selectedShip()
  if (ship) patchFilters({ capacity: ship.scu })
  $('ship').value = String(id)
  renderFleet()
}

function fillPresetSelect() {
  const select = $('preset-select')
  select.innerHTML = option('', 'Выберите пресет', '') + state.presets.map((p) => option(p.id, p.name, '')).join('')
}

function savePreset() {
  const name = $('preset-name').value.trim()
  if (!name) { $('preset-name').focus(); return }
  state.presets.push({ id: `p-${Date.now()}`, name, filters: { ...state.filters }, selectedShipId: state.selectedShipId })
  saveJson(PRESETS_KEY, state.presets)
  $('preset-name').value = ''
  fillPresetSelect()
}

function applyPreset() {
  const id = $('preset-select').value
  const preset = state.presets.find((p) => p.id === id)
  if (!preset) return
  state.selectedShipId = preset.selectedShipId ?? 'custom'
  state.filters = { ...DEFAULT_FILTERS, ...preset.filters }
  saveJson(SHIP_KEY, state.selectedShipId)
  saveJson(FILTERS_KEY, state.filters)
  hydrateControls()
  renderAll()
}

function deletePreset() {
  const id = $('preset-select').value
  if (!id) return
  state.presets = state.presets.filter((p) => p.id !== id)
  saveJson(PRESETS_KEY, state.presets)
  fillPresetSelect()
}

function bindControls() {
  for (const [id, key] of [['capacity', 'capacity'], ['budget', 'budget'], ['min-profit', 'minProfit'], ['min-roi', 'minRoi'], ['min-profit-scu', 'minProfitPerScu'], ['max-age', 'maxAgeHours'], ['max-distance', 'maxDistanceGm'], ['container-size', 'containerSize']]) {
    $(id).addEventListener('change', () => patchFilters({ [key]: numberInput(id, 0) }))
  }
  $('search').addEventListener('input', (e) => patchFilters({ search: e.target.value }))
  $('system-from').addEventListener('change', (e) => patchFilters({ systemFrom: e.target.value, terminalFrom: 'all' }))
  $('system-to').addEventListener('change', (e) => patchFilters({ systemTo: e.target.value, terminalTo: 'all' }))
  $('terminal-from').addEventListener('change', (e) => patchFilters({ terminalFrom: e.target.value }))
  $('terminal-to').addEventListener('change', (e) => patchFilters({ terminalTo: e.target.value }))
  $('commodity').addEventListener('change', (e) => patchFilters({ commodity: e.target.value }))
  $('sort').innerHTML = SORT_OPTIONS.map(([v, l]) => option(v, l, state.filters.sort)).join('')
  $('sort').addEventListener('change', (e) => patchFilters({ sort: e.target.value }))
  $('only-legal').addEventListener('change', (e) => patchFilters({ onlyLegal: e.target.checked }))
  $('same-system').addEventListener('change', (e) => patchFilters({ onlySameSystem: e.target.checked }))
  $('known-availability').addEventListener('change', (e) => patchFilters({ requireKnownAvailability: e.target.checked }))
  $('favorites-only').addEventListener('change', (e) => patchFilters({ favoritesOnly: e.target.checked }))
  $('ship').addEventListener('change', (e) => {
    state.selectedShipId = e.target.value
    saveJson(SHIP_KEY, state.selectedShipId)
    const ship = selectedShip()
    if (ship) patchFilters({ capacity: ship.scu })
    renderFleet()
  })
  $('reset-filters').addEventListener('click', () => {
    state.filters = { ...DEFAULT_FILTERS }
    state.selectedShipId = 'custom'
    saveJson(FILTERS_KEY, state.filters); saveJson(SHIP_KEY, state.selectedShipId)
    hydrateControls(); renderAll()
  })
  $('refresh-data').addEventListener('click', () => loadSnapshot({ bust: true }))
  $('mode-single').addEventListener('click', () => { state.mode = 'single'; state.visible = 25; renderAll() })
  $('mode-multi').addEventListener('click', () => { state.mode = 'multi'; state.visible = 25; renderAll() })
  $('max-stops').addEventListener('change', (e) => { state.maxStops = Number(e.target.value) || 2; renderAll() })
  $('load-more').addEventListener('click', () => { state.visible += 25; renderRoutes() })
  $('fleet-search').addEventListener('input', renderFleet)
  $('save-preset').addEventListener('click', savePreset)
  $('apply-preset').addEventListener('click', applyPreset)
  $('delete-preset').addEventListener('click', deletePreset)
  $('detail-close').addEventListener('click', closeDetail)
  $('detail-dialog').addEventListener('click', (e) => { if (e.target === $('detail-dialog')) closeDetail() })
  $('history-button').addEventListener('click', loadHistory)
  document.querySelectorAll('[data-scroll]').forEach((el) => el.addEventListener('click', () => document.getElementById(el.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' })))
}

bindControls()
loadSnapshot()
