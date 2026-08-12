import { useMemo, useState } from 'react'
import Icon from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber } from '@/lib/routes'
import type { Ship } from '@/lib/data'

interface Props { ships: Ship[]; loading: boolean; selectedShipId: string | number | 'custom'; onPick: (ship: Ship) => void }
const GROUPS: { id: 'all' | 'light' | 'medium' | 'heavy'; label: string; test: (s: Ship) => boolean }[] = [
  { id: 'all', label: 'Все', test: () => true }, { id: 'light', label: 'До 100 SCU', test: (s) => s.scu <= 100 }, { id: 'medium', label: '100–1000 SCU', test: (s) => s.scu > 100 && s.scu <= 1000 }, { id: 'heavy', label: 'Свыше 1000 SCU', test: (s) => s.scu > 1000 },
]

export function FleetSection({ ships, loading, selectedShipId, onPick }: Props) {
  const [group, setGroup] = useState<'all' | 'light' | 'medium' | 'heavy'>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const filtered = useMemo(() => { const test = GROUPS.find((g) => g.id === group)!.test; const q = query.trim().toLowerCase(); return ships.filter((s) => test(s) && (!q || s.name.toLowerCase().includes(q) || String(s.manufacturer || '').toLowerCase().includes(q))).sort((a, b) => b.scu - a.scu) }, [ships, group, query])
  const shown = expanded ? filtered : filtered.slice(0, 12)
  return (
    <section id="fleet" className="scroll-mt-20 border-t border-border py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">Ангар</p><h2 className="mt-2 font-display text-3xl font-semibold uppercase tracking-tight sm:text-4xl">Флот и вместимость трюма</h2><p className="mt-2 max-w-2xl font-mono text-sm text-muted-foreground">Вместимость и характеристики по community-данным UEX. Нажмите на корабль — его трюм подставится в расчёт, и список рейсов пересчитается.</p></div>
          <div className="relative w-full sm:w-64"><Icon name="Search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск корабля" aria-label="Поиск корабля" className="pl-9 font-mono" /></div>
        </div>
        <div className="mb-6 flex flex-wrap gap-2">{GROUPS.map((g) => <button key={g.id} type="button" onClick={() => { setGroup(g.id); setExpanded(false) }} aria-pressed={group === g.id} className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] transition-colors ${group === g.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-primary'}`}>{g.label}</button>)}</div>
        {loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : shown.length === 0 ? <p className="hud-panel p-8 text-center font-mono text-sm text-muted-foreground">Корабль не найден. Попробуйте другое название.</p> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map((s) => { const active = String(selectedShipId) === String(s.id); return <li key={String(s.id)}><button type="button" onClick={() => onPick(s)} aria-pressed={active} className={`hud-panel flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover-scale ${active ? 'border-primary bg-primary/10' : 'hover:border-primary/60'}`}><span className="min-w-0"><span className="block truncate font-display text-base font-semibold uppercase tracking-[0.06em]">{s.name}</span><span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{s.manufacturer || 'корабль'}{s.crew ? ` · экипаж ${s.crew}` : ''}{s.containerSizes?.length ? ` · контейнеры ${s.containerSizes.join('/')}` : ''}</span></span><span className="shrink-0 text-right"><span className="block font-display text-xl font-semibold tabular-nums text-primary">{formatNumber(s.scu)}</span><span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">SCU</span></span></button></li> })}</ul>}
        {!loading && filtered.length > 12 && <div className="mt-6 text-center"><Button variant="outline" onClick={() => setExpanded((v) => !v)} className="font-mono uppercase tracking-[0.12em]"><Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} className="mr-2" />{expanded ? 'Свернуть' : `Показать все ${filtered.length}`}</Button></div>}
      </div>
    </section>
  )
}
