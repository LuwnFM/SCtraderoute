import { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatAge, formatNumber, type TradeRoute } from '@/lib/routes'
import { loadRouteHistory, type HistoryPoint } from '@/lib/history'
import { estimateTravelTime, formatTravelDuration } from '@/lib/travel-time'

const PAGE_SIZE = 25

interface Props {
  routes: TradeRoute[]
  loading: boolean
  error: string | null
  onRetry: () => void
  favorites: Set<string>
  onToggleFavorite: (key: string) => void
}

export function RouteList({ routes, loading, error, onRetry, favorites, onToggleFavorite }: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [detail, setDetail] = useState<TradeRoute | null>(null)
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => { setLimit(PAGE_SIZE) }, [routes])
  useEffect(() => { setHistory(null); setHistoryError(null); setHistoryNotice(null); setHistoryLoading(false) }, [detail])
  const visible = routes.slice(0, limit)
  const detailTravel = detail ? estimateTravelTime(detail) : null

  if (loading) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
  if (error) return <div className="hud-panel hud-corners p-8 text-center"><Icon name="SatelliteDish" size={32} className="mx-auto mb-4 text-destructive" /><h3 className="font-display text-lg uppercase tracking-[0.14em]">Связь потеряна</h3><p className="mx-auto mt-2 max-w-md font-mono text-sm text-muted-foreground">{error}</p><Button onClick={onRetry} className="mt-5 font-mono uppercase tracking-[0.12em]"><Icon name="RefreshCw" size={16} className="mr-2" />Повторить запрос</Button></div>
  if (!routes.length) return <div className="hud-panel hud-corners p-10 text-center"><Icon name="Telescope" size={32} className="mx-auto mb-4 text-primary" /><h3 className="font-display text-lg uppercase tracking-[0.14em]">Рейсов не найдено</h3><p className="mx-auto mt-2 max-w-md font-mono text-sm text-muted-foreground">Слишком строгие условия. Попробуйте увеличить бюджет, разрешить неизвестный supply/demand или выбрать «Любая система».</p></div>

  const loadHistory = async () => {
    if (!detail?.commodity.uexId || (!detail.from.uexId && !detail.to.uexId)) return
    setHistoryLoading(true); setHistoryError(null); setHistoryNotice(null)
    try {
      const result = await loadRouteHistory(detail)
      setHistory(result.points)
      if (result.missing.length) setHistoryNotice(result.missing.join(' · '))
      else if (!result.points.length) setHistoryNotice('UEX не вернул исторических цен для выбранных точек.')
    } catch (e) { setHistoryError(e instanceof Error ? e.message : String(e)) }
    finally { setHistoryLoading(false) }
  }

  return <>
    <ol className="space-y-3">
      {visible.map((r, i) => {
        const eta = estimateTravelTime(r)
        return <li key={r.key}><article className="hud-panel group relative overflow-hidden p-4 transition-colors hover:border-primary/60 sm:p-5"><div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex items-center gap-3 lg:w-16"><span className="font-display text-2xl font-semibold tabular-nums text-primary/70">{String(i + 1).padStart(2, '0')}</span></div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-semibold uppercase tracking-[0.08em]">{r.commodity.name}</h3>{r.commodity.isIllegal && <Badge variant="destructive" className="font-mono text-[10px] uppercase">контрабанда</Badge>}{!r.sameSystem && <Badge variant="outline" className="font-mono text-[10px] uppercase">межсистемный</Badge>}{r.stale && <Badge variant="outline" className="border-primary/50 font-mono text-[10px] uppercase text-primary">stale</Badge>}{r.sources.map((source) => <Badge key={source} variant="secondary" className="font-mono text-[10px] uppercase">{source}</Badge>)}</div>
            <div className="mt-2 grid gap-1.5 font-mono text-xs sm:grid-cols-2"><p className="flex items-start gap-2 text-muted-foreground"><Icon name="ArrowDownToLine" size={14} className="mt-0.5 shrink-0 text-accent" /><span><span className="text-foreground">{r.from.name}</span> · {r.from.location}<span className="block text-[11px]">закупка {formatNumber(r.buyPrice)} aUEC/SCU · {r.from.system} · {formatAge(r.buyUpdatedAt)}</span></span></p><p className="flex items-start gap-2 text-muted-foreground"><Icon name="ArrowUpFromLine" size={14} className="mt-0.5 shrink-0 text-primary" /><span><span className="text-foreground">{r.to.name}</span> · {r.to.location}<span className="block text-[11px]">сбыт {formatNumber(r.sellPrice)} aUEC/SCU · {r.to.system} · {formatAge(r.sellUpdatedAt)}</span></span></p></div>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">{!r.sameSystem ? `${r.path.systems.join(' → ')}${r.path.jumpCount != null ? ` · ${r.path.jumpCount} переход(а)` : ''}` : `Внутри ${r.from.system}`}{eta ? ` · ETA β ~${formatTravelDuration(eta.totalSeconds)}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-3 lg:w-72 lg:flex-col lg:items-end lg:justify-center lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><div className="text-left lg:text-right"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Чистая прибыль</p><p className="font-display text-2xl font-semibold tabular-nums text-success">+{formatNumber(r.profit)}</p><p className="font-mono text-[11px] text-muted-foreground">{formatNumber(r.units)} SCU · маржа {r.margin.toFixed(0)}%{eta?.profitPerMinute != null ? ` · ~${formatNumber(eta.profitPerMinute)} aUEC/мин` : ''}</p></div><div className="flex gap-2"><Button variant="ghost" size="icon" className="h-9 w-9 text-primary" aria-label={favorites.has(r.key) ? 'Убрать из избранного' : 'Добавить в избранное'} onClick={() => onToggleFavorite(r.key)}><Icon name="Star" size={16} fill={favorites.has(r.key) ? 'currentColor' : 'none'} /></Button><Button variant="outline" size="sm" className="font-mono text-xs uppercase tracking-[0.12em]" onClick={() => setDetail(r)}>Разбор рейса</Button></div></div>
        </div></article></li>
      })}
    </ol>
    {limit < routes.length && <div className="mt-6 text-center"><Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="font-mono uppercase tracking-[0.12em]"><Icon name="Plus" size={16} className="mr-2" />Показать ещё {Math.min(PAGE_SIZE, routes.length - limit)}</Button><p className="mt-2 font-mono text-xs text-muted-foreground">Показано {formatNumber(visible.length)} из {formatNumber(routes.length)}</p></div>}
    <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">{detail && <><DialogHeader><DialogTitle className="font-display uppercase tracking-[0.1em]">{detail.commodity.name}</DialogTitle><DialogDescription className="font-mono text-xs">{detail.from.name} → {detail.to.name}</DialogDescription></DialogHeader><dl className="grid grid-cols-2 gap-px border border-border bg-border font-mono text-sm sm:grid-cols-3"><Cell label="Груз" value={`${formatNumber(detail.units)} SCU`} /><Cell label="Вложения" value={`${formatNumber(detail.investment)} aUEC`} /><Cell label="Выручка" value={`${formatNumber(detail.revenue)} aUEC`} /><Cell label="Прибыль" value={`+${formatNumber(detail.profit)} aUEC`} accent /><Cell label="Прибыль за SCU" value={`${formatNumber(detail.profitPerScu)} aUEC`} /><Cell label="ROI" value={`${detail.roi.toFixed(1)} %`} /><Cell label="Supply" value={detail.supply == null ? 'нет данных' : `${formatNumber(detail.supply)} SCU`} /><Cell label="Demand" value={detail.demand == null ? 'нет данных' : `${formatNumber(detail.demand)} SCU`} /><Cell label="Ограничивает" value={detail.limitedBy || '—'} /><Cell label="Цена покупки" value={formatAge(detail.buyUpdatedAt)} /><Cell label="Цена продажи" value={formatAge(detail.sellUpdatedAt)} /><Cell label="Расстояние" value={detail.distanceGm == null ? 'нет данных' : `${formatNumber(detail.distanceGm, 1)} Gm`} /><Cell label="ETA β" value={detailTravel ? `~${formatTravelDuration(detailTravel.totalSeconds)}` : 'нет данных'} /><Cell label="Прибыль/мин β" value={detailTravel?.profitPerMinute == null ? 'нет данных' : `~${formatNumber(detailTravel.profitPerMinute)} aUEC/мин`} /></dl><div className="space-y-1 font-mono text-xs text-muted-foreground"><p>{detail.sameSystem ? `Внутрисистемный маршрут: ${detail.from.system}` : `Путь: ${detail.path.systems.join(' → ')}${detail.path.jumpCount != null ? ` · переходов: ${detail.path.jumpCount}` : ''}`}</p><p>Источники: {detail.sources.length ? detail.sources.join(' + ') : 'не указаны'}.</p>{detail.availabilityUnknown && <p className="text-primary">Supply/demand известны не полностью — учитывайте это перед крупной сделкой.</p>}{detailTravel && <p className="text-primary/80">ETA β — экспериментальная оценка по расстоянию UEX, откалиброванная по доступным парам Gm/ETA. Она не включает loading/wait time и не является точным timeInSeconds SC Trade Tools.</p>}</div><div className="border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display uppercase tracking-[0.08em]">История цен</h3><p className="font-mono text-[11px] text-muted-foreground">Реальные точки UEX из same-origin кэша CargoNav; браузер больше не обращается к UEX напрямую.</p></div><Button variant="outline" size="sm" disabled={historyLoading || !(detail.commodity.uexId && (detail.from.uexId || detail.to.uexId))} onClick={loadHistory} className="font-mono text-xs uppercase">{historyLoading ? 'Загрузка…' : 'История цены'}</Button></div>{historyError && <p className="mt-3 font-mono text-xs text-destructive">{historyError}</p>}{historyNotice && <p className="mt-3 font-mono text-xs text-primary">{historyNotice}</p>}{history && <HistoryChart points={history} />}{!(detail.commodity.uexId && (detail.from.uexId || detail.to.uexId)) && <p className="mt-3 font-mono text-xs text-muted-foreground">Для этой точки нет UEX ID, поэтому UEX history недоступна.</p>}</div></>}</DialogContent></Dialog>
  </>
}

function HistoryChart({ points }: { points: HistoryPoint[] }) { const useful = points.filter((p) => p.t > 0 && p.v > 0); const geometry = useMemo(() => { if (useful.length < 2) return null; const minT = Math.min(...useful.map((p) => p.t)), maxT = Math.max(...useful.map((p) => p.t)), minV = Math.min(...useful.map((p) => p.v)), maxV = Math.max(...useful.map((p) => p.v)), W = 720, H = 220, P = 24; const x=(t:number)=>P+((t-minT)/Math.max(1,maxT-minT))*(W-P*2); const y=(v:number)=>H-P-((v-minV)/Math.max(1,maxV-minV))*(H-P*2); const path=(kind:'buy'|'sell')=>useful.filter((p)=>p.kind===kind).map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '); return {W,H,P,minV,maxV,buy:path('buy'),sell:path('sell')} }, [useful]); if (!geometry) return <p className="mt-3 font-mono text-xs text-muted-foreground">Недостаточно исторических данных для графика.</p>; return <div className="mt-4 border border-border bg-card/50 p-3"><svg viewBox={`0 0 ${geometry.W} ${geometry.H}`} role="img" aria-label="История цен UEX" className="h-auto w-full"><path d={`M${geometry.P},${geometry.H-geometry.P} H${geometry.W-geometry.P}`} stroke="hsl(var(--border))" fill="none"/><path d={geometry.buy} stroke="hsl(var(--accent))" strokeWidth="2" fill="none"/><path d={geometry.sell} stroke="hsl(var(--primary))" strokeWidth="2" fill="none"/></svg><div className="flex flex-wrap gap-4 font-mono text-[10px] text-muted-foreground"><span className="text-accent">● покупка origin</span><span className="text-primary">● продажа destination</span><span>{formatNumber(geometry.minV)}–{formatNumber(geometry.maxV)} aUEC/SCU</span></div></div> }
function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className="bg-card p-3"><dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt><dd className={`mt-1 tabular-nums ${accent ? 'text-success font-semibold' : 'text-foreground'}`}>{value}</dd></div> }
