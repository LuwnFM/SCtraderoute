import { useMemo, useState } from 'react'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Commodity, Ship, Terminal } from '@/lib/data'
import { formatNumber, terminalsOf, type RouteFilters, type SortKey } from '@/lib/routes'

interface Props {
  filters: RouteFilters
  onChange: (patch: Partial<RouteFilters>) => void
  onReset: () => void
  ships: Ship[]
  commodities: Commodity[]
  terminals: Terminal[]
  systems: string[]
  selectedShipId: string | number | 'custom'
  onShipChange: (id: string | number | 'custom') => void
  found: number
  onRefresh: () => void
  refreshing: boolean
  updatedLabel: string
}

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'profit', label: 'Прибыль за рейс' },
  { value: 'profitPerScu', label: 'Прибыль за SCU' },
  { value: 'margin', label: 'Маржа, %' },
  { value: 'roi', label: 'Возврат вложений, %' },
  { value: 'freshness', label: 'Свежесть данных' },
  { value: 'distance', label: 'Расстояние' },
]

export function RouteFiltersPanel({ filters, onChange, onReset, ships, commodities, terminals, systems, selectedShipId, onShipChange, found, onRefresh, refreshing, updatedLabel }: Props) {
  const [advanced, setAdvanced] = useState(false)
  const sortedCommodities = useMemo(() => [...commodities].sort((a, b) => a.name.localeCompare(b.name)), [commodities])
  const maxScu = ships.length ? Math.max(...ships.map((s) => Number(s.scu) || 0), 12000) : 12000
  const fromTerminals = useMemo(() => terminalsOf(terminals, filters.systemFrom), [terminals, filters.systemFrom])
  const toTerminals = useMemo(() => terminalsOf(terminals, filters.systemTo), [terminals, filters.systemTo])

  return (
    <div className="hud-panel hud-corners relative p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div><h2 className="font-display text-xl font-semibold uppercase tracking-[0.14em] sm:text-2xl">Панель расчёта рейса</h2><p className="mt-1 font-mono text-xs text-muted-foreground">Найдено маршрутов: <span className="font-semibold text-primary">{formatNumber(found)}</span>{' · '}данные обновлены {updatedLabel}</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="font-mono text-xs uppercase tracking-[0.12em]"><Icon name="RefreshCw" size={15} className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Обновляю' : 'Обновить'}</Button><Button variant="ghost" size="sm" onClick={onReset} className="font-mono text-xs uppercase tracking-[0.12em]"><Icon name="RotateCcw" size={15} className="mr-1.5" />Сброс</Button></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <div><Label htmlFor="ship" className="font-mono text-xs uppercase tracking-[0.16em]">Корабль</Label><Select value={String(selectedShipId)} onValueChange={(v) => onShipChange(v === 'custom' ? 'custom' : v)}><SelectTrigger id="ship" className="mt-2 font-mono"><SelectValue placeholder="Выберите корабль" /></SelectTrigger><SelectContent className="max-h-72"><SelectItem value="custom">Свой объём трюма</SelectItem>{ships.map((s) => <SelectItem key={String(s.id)} value={String(s.id)}>{s.name} — {formatNumber(s.scu)} SCU</SelectItem>)}</SelectContent></Select></div>
          <div><div className="flex items-end justify-between gap-3"><Label htmlFor="capacity" className="font-mono text-xs uppercase tracking-[0.16em]">Вместимость, SCU</Label><Input id="capacity" type="number" min={1} max={100000} inputMode="numeric" value={filters.capacity} onChange={(e) => { const v = Number(e.target.value); onChange({ capacity: Number.isFinite(v) && v > 0 ? Math.min(v, 100000) : 1 }); onShipChange('custom') }} className="h-9 w-28 text-right font-mono tabular-nums" /></div><Slider className="mt-4" value={[Math.min(filters.capacity, maxScu)]} min={1} max={maxScu} step={1} aria-label="Вместимость трюма в SCU" onValueChange={([v]) => { onChange({ capacity: v }); onShipChange('custom') }} /></div>
          <div><div className="flex items-end justify-between gap-3"><Label htmlFor="budget" className="font-mono text-xs uppercase tracking-[0.16em]">Бюджет, aUEC</Label><Input id="budget" type="number" min={0} step={10000} inputMode="numeric" value={filters.budget} onChange={(e) => { const v = Number(e.target.value); onChange({ budget: Number.isFinite(v) && v >= 0 ? v : 0 }) }} className="h-9 w-32 text-right font-mono tabular-nums" /></div><p className="mt-2 font-mono text-[11px] text-muted-foreground">0 — считать без ограничения по деньгам.</p></div>
        </div>
        <div className="space-y-4">
          <div><Label htmlFor="commodity" className="font-mono text-xs uppercase tracking-[0.16em]">Товар</Label><Select value={filters.commodityKey} onValueChange={(v) => onChange({ commodityKey: v })}><SelectTrigger id="commodity" className="mt-2 font-mono"><SelectValue /></SelectTrigger><SelectContent className="max-h-72"><SelectItem value="all">Все товары</SelectItem>{sortedCommodities.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}{c.isIllegal ? ' (контрабанда)' : ''}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="sys-from" className="font-mono text-xs uppercase tracking-[0.16em]">Система закупки</Label><Select value={filters.systemFrom} onValueChange={(v) => onChange({ systemFrom: v, terminalFrom: 'all' })}><SelectTrigger id="sys-from" className="mt-2 font-mono"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Любая</SelectItem>{systems.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="sys-to" className="font-mono text-xs uppercase tracking-[0.16em]">Система сбыта</Label><Select value={filters.systemTo} onValueChange={(v) => onChange({ systemTo: v, terminalTo: 'all' })}><SelectTrigger id="sys-to" className="mt-2 font-mono"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Любая</SelectItem>{systems.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
          <div><Label htmlFor="search" className="font-mono text-xs uppercase tracking-[0.16em]">Поиск по точке или товару</Label><div className="relative mt-2"><Icon name="Search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="search" value={filters.search} onChange={(e) => onChange({ search: e.target.value })} placeholder="Например: Area18, Laranite" className="pl-9 font-mono" /></div></div>
        </div>
        <div className="space-y-4">
          <div><Label htmlFor="sort" className="font-mono text-xs uppercase tracking-[0.16em]">Сортировка</Label><Select value={filters.sort} onValueChange={(v) => onChange({ sort: v as SortKey })}><SelectTrigger id="sort" className="mt-2 font-mono"><SelectValue /></SelectTrigger><SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-3 border border-border bg-secondary/40 p-4"><ToggleRow id="stock" label="Только с известным supply/demand" checked={filters.requireKnownAvailability} onChange={(v) => onChange({ requireKnownAvailability: v })} /><ToggleRow id="legal" label="Исключить контрабанду" checked={filters.onlyLegal} onChange={(v) => onChange({ onlyLegal: v })} /><ToggleRow id="same" label="Не покидать систему" checked={filters.onlySameSystem} onChange={(v) => onChange({ onlySameSystem: v })} /></div>
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-primary" aria-expanded={advanced}><Icon name={advanced ? 'ChevronUp' : 'ChevronDown'} size={15} />Дополнительно</button>
        </div>
      </div>
      {advanced && <div className="mt-6 border-t border-border pt-5 animate-fade-in"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><FieldSelect label="Терминал закупки" value={filters.terminalFrom} onValue={(v) => onChange({ terminalFrom: v })} items={fromTerminals.map((t) => [t.key, t.name])} /><FieldSelect label="Терминал сбыта" value={filters.terminalTo} onValue={(v) => onChange({ terminalTo: v })} items={toTerminals.map((t) => [t.key, t.name])} /><NumberField label="Мин. прибыль, aUEC" value={filters.minProfit} step={5000} onValue={(v) => onChange({ minProfit: v })} /><NumberField label="Мин. прибыль / SCU" value={filters.minProfitPerScu} step={100} onValue={(v) => onChange({ minProfitPerScu: v })} /><NumberField label="Мин. ROI, %" value={filters.minRoi} step={1} onValue={(v) => onChange({ minRoi: v })} /><NumberField label="Макс. возраст, ч" value={filters.maxAgeHours} step={1} onValue={(v) => onChange({ maxAgeHours: v })} /><NumberField label="Макс. расстояние, Gm" value={filters.maxDistanceGm} step={1} onValue={(v) => onChange({ maxDistanceGm: v })} /><FieldSelect label="Контейнер, SCU" value={String(filters.containerSize)} onValue={(v) => onChange({ containerSize: Number(v) })} items={[['0','Любой'],['1','1'],['2','2'],['4','4'],['8','8'],['16','16'],['24','24'],['32','32']]} noAll /><div className="flex items-end"><ToggleRow id="favonly" label="Только избранные" checked={filters.favoritesOnly} onChange={(v) => onChange({ favoritesOnly: v })} /></div></div><PresetTools filters={filters} onApply={onChange} /></div>}
    </div>
  )
}

const PRESETS_KEY = 'cargonav-presets-v2'
type Preset = { id: string; name: string; filters: RouteFilters }
function readPresets(): Preset[] { try { const p = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }
function PresetTools({ filters, onApply }: { filters: RouteFilters; onApply: (p: Partial<RouteFilters>) => void }) {
  const [presets, setPresets] = useState<Preset[]>(readPresets)
  const [selected, setSelected] = useState('')
  const persist = (next: Preset[]) => { setPresets(next); try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)) } catch {} }
  const save = () => { const name = window.prompt('Название пресета'); if (!name?.trim()) return; const p = { id: `${Date.now()}`, name: name.trim(), filters: { ...filters } }; persist([...presets, p]); setSelected(p.id) }
  const apply = () => { const p = presets.find((x) => x.id === selected); if (p) onApply({ ...p.filters }) }
  const rename = () => { const p = presets.find((x) => x.id === selected); if (!p) return; const name = window.prompt('Новое название', p.name); if (!name?.trim()) return; persist(presets.map((x) => x.id === selected ? { ...x, name: name.trim() } : x)) }
  const remove = () => { if (!selected) return; persist(presets.filter((x) => x.id !== selected)); setSelected('') }
  return <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-border pt-4"><div className="min-w-52 flex-1"><Label className="font-mono text-[11px] uppercase tracking-[0.14em]">Пресеты фильтров</Label><Select value={selected || '__none'} onValueChange={(v) => setSelected(v === '__none' ? '' : v)}><SelectTrigger className="mt-2 font-mono"><SelectValue placeholder="Выберите пресет" /></SelectTrigger><SelectContent><SelectItem value="__none">Не выбран</SelectItem>{presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><Button type="button" size="sm" variant="outline" onClick={save} className="font-mono text-xs uppercase">Сохранить</Button><Button type="button" size="sm" variant="outline" disabled={!selected} onClick={apply} className="font-mono text-xs uppercase">Применить</Button><Button type="button" size="sm" variant="ghost" disabled={!selected} onClick={rename} className="font-mono text-xs uppercase">Переименовать</Button><Button type="button" size="sm" variant="ghost" disabled={!selected} onClick={remove} className="font-mono text-xs uppercase text-destructive">Удалить</Button></div>
}
function ToggleRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) { return <div className="flex w-full items-center justify-between gap-3"><Label htmlFor={id} className="cursor-pointer font-mono text-xs leading-snug">{label}</Label><Switch id={id} checked={checked} onCheckedChange={onChange} /></div> }
function NumberField({ label, value, step, onValue }: { label: string; value: number; step: number; onValue: (v: number) => void }) { return <div><Label className="font-mono text-[11px] uppercase tracking-[0.14em]">{label}</Label><Input type="number" min={0} step={step} value={value} onChange={(e) => onValue(Math.max(0, Number(e.target.value) || 0))} className="mt-2 font-mono tabular-nums" /></div> }
function FieldSelect({ label, value, onValue, items, noAll = false }: { label: string; value: string; onValue: (v: string) => void; items: string[][]; noAll?: boolean }) { return <div><Label className="font-mono text-[11px] uppercase tracking-[0.14em]">{label}</Label><Select value={value} onValueChange={onValue}><SelectTrigger className="mt-2 font-mono"><SelectValue /></SelectTrigger><SelectContent>{!noAll && <SelectItem value="all">Любой</SelectItem>}{items.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div> }
