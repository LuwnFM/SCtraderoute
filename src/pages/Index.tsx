import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/ui/icon'
import { SiteHeader } from '@/components/site-header'
import { HeroSection } from '@/components/hero-section'
import { RouteFiltersPanel } from '@/components/route-filters'
import { RouteList } from '@/components/route-list'
import { MultiStopList, RouteModeToggle } from '@/components/multi-stop-list'
import { FleetSection } from '@/components/fleet-section'
import { FaqSection } from '@/components/faq-section'
import { SiteFooter } from '@/components/site-footer'
import { useTradeData } from '@/hooks/use-trade-data'
import { flightReadyShips, type Ship } from '@/lib/data'
import { DEFAULT_FILTERS, computeMultiStop, computeRoutes, formatNumber, selectedShip, summarizeRoutes, systemsOf, type RouteFilters } from '@/lib/routes'

const FILTERS_KEY = 'cargonav-filters-react-v1'
const FAVORITES_KEY = 'cargonav-favorites-v1'
const SHIP_KEY = 'cargonav-ship-v1'

function readJson<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }
function writeJson(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
function loadFilters(): RouteFilters { return { ...DEFAULT_FILTERS, ...readJson<Partial<RouteFilters>>(FILTERS_KEY, {}), search: '' } }

export default function Index() {
  const { data, loading, error, refreshing, refresh } = useTradeData()
  const [filters, setFilters] = useState<RouteFilters>(loadFilters)
  const [selectedShipId, setSelectedShipId] = useState<string | number | 'custom'>(() => readJson(SHIP_KEY, 'custom'))
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readJson<string[]>(FAVORITES_KEY, [])))
  const [mode, setMode] = useState<'single' | 'multi'>('single')
  const [maxStops, setMaxStops] = useState(2)

  useEffect(() => writeJson(FILTERS_KEY, filters), [filters])
  useEffect(() => writeJson(SHIP_KEY, selectedShipId), [selectedShipId])
  useEffect(() => writeJson(FAVORITES_KEY, [...favorites]), [favorites])

  const patch = useCallback((p: Partial<RouteFilters>) => setFilters((f) => ({ ...f, ...p })), [])
  const reset = useCallback(() => { setFilters({ ...DEFAULT_FILTERS }); setSelectedShipId('custom') }, [])
  const ships = useMemo(() => data ? flightReadyShips(data.ships) : [], [data])
  const systems = useMemo(() => data ? systemsOf(data.terminals) : [], [data])
  const chosenShip = useMemo(() => selectedShip(ships, selectedShipId), [ships, selectedShipId])

  const pickShip = useCallback((ship: Ship) => { setSelectedShipId(ship.id); patch({ capacity: ship.scu }); document.getElementById('terminal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [patch])
  const handleShipChange = useCallback((id: string | number | 'custom') => { setSelectedShipId(id); if (id !== 'custom') { const ship = selectedShip(ships, id); if (ship) patch({ capacity: ship.scu }) } }, [ships, patch])
  const toggleFavorite = useCallback((key: string) => setFavorites((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next }), [])

  const routes = useMemo(() => {
    if (!data) return []
    if (chosenShip && filters.containerSize > 0 && chosenShip.containerSizes?.length && !chosenShip.containerSizes.map(Number).includes(filters.containerSize)) return []
    return computeRoutes(data, filters, favorites)
  }, [data, filters, favorites, chosenShip])
  const multiRoutes = useMemo(() => computeMultiStop(routes, filters, maxStops), [routes, filters, maxStops])
  const summary = useMemo(() => summarizeRoutes(routes), [routes])

  const updatedLabel = data?.meta.generatedAt ? new Date(data.meta.generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'
  const sourceReports = data?.meta.sourceReports || []
  const okSources = sourceReports.filter((x) => x.ok).map((x) => x.name)
  const sourceLabel = okSources.length ? okSources.join(' + ') : 'Сохранённый trade snapshot'
  const failedSources = sourceReports.filter((x) => !x.ok)

  return <div className="starfield relative min-h-screen"><div className="pointer-events-none fixed inset-0 stars-layer opacity-60" aria-hidden="true" /><div className="relative">
    <SiteHeader />
    <main>
      <HeroSection terminals={data?.terminals.length ?? 0} commodities={data?.commodities.length ?? 0} ships={ships.length} loading={loading} sourceLabel={sourceLabel} />
      <section id="terminal" className="scroll-mt-20 py-14 sm:py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">Шаг 1</p><h2 className="mb-8 mt-2 font-display text-3xl font-semibold uppercase tracking-tight sm:text-4xl">Настройте параметры полёта</h2>
        {failedSources.length > 0 && <p className="mb-6 flex items-start gap-2.5 border border-primary/40 bg-primary/10 p-4 font-mono text-xs leading-relaxed text-foreground"><Icon name="TriangleAlert" size={16} className="mt-0.5 shrink-0 text-primary" /><span>Часть источников была недоступна при обновлении snapshot: {failedSources.map((x) => x.name).join(', ')}. Расчёт использует доступные данные и сохранённый snapshot.</span></p>}
        <RouteFiltersPanel filters={filters} onChange={patch} onReset={reset} ships={ships} commodities={data?.commodities ?? []} terminals={data?.terminals ?? []} systems={systems} selectedShipId={selectedShipId} onShipChange={handleShipChange} found={mode === 'single' ? routes.length : multiRoutes.length} onRefresh={refresh} refreshing={refreshing} updatedLabel={updatedLabel} />
        {summary && <dl className="mt-6 grid gap-px border border-border bg-border sm:grid-cols-3"><div className="bg-card/90 p-5"><dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Лучший рейс</dt><dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-success">+{formatNumber(summary.best.profit)}</dd><dd className="mt-1 font-mono text-xs text-muted-foreground">{summary.best.commodity.name}: {summary.best.from.name} → {summary.best.to.name}</dd></div><div className="bg-card/90 p-5"><dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Средняя прибыль топ-10</dt><dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">{formatNumber(summary.avgProfit)}</dd><dd className="mt-1 font-mono text-xs text-muted-foreground">aUEC за рейс</dd></div><div className="bg-card/90 p-5"><dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Средняя маржа топ-10</dt><dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-primary">{summary.avgMargin.toFixed(0)}%</dd><dd className="mt-1 font-mono text-xs text-muted-foreground">к цене закупки</dd></div></dl>}
      </div></section>
      <section id="routes" className="scroll-mt-20 border-t border-border py-14 sm:py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">Шаг 2</p><h2 className="mt-2 font-display text-3xl font-semibold uppercase tracking-tight sm:text-4xl">Прибыльные маршруты</h2></div><div className="flex flex-col items-end gap-3"><p className="flex items-center gap-2 font-mono text-xs text-muted-foreground"><Icon name="Info" size={14} className="text-primary" />Расчёт на {formatNumber(filters.capacity)} SCU{filters.budget > 0 ? ` и ${formatNumber(filters.budget)} aUEC` : ' без лимита бюджета'}</p><RouteModeToggle mode={mode} onMode={setMode} maxStops={maxStops} onStops={setMaxStops} /></div></div>
        {mode === 'single' ? <RouteList routes={routes} ship={chosenShip} loading={loading} error={error} onRetry={refresh} favorites={favorites} onToggleFavorite={toggleFavorite} /> : <MultiStopList routes={multiRoutes} />}
      </div></section>
      <FleetSection ships={ships} loading={loading} selectedShipId={selectedShipId} onPick={pickShip} />
      <FaqSection />
    </main>
    <SiteFooter />
  </div></div>
}