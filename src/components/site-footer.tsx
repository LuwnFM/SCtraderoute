import Icon from '@/components/ui/icon'

export function SiteFooter() {
  return <footer className="border-t border-border bg-card/40"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <div><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center border border-primary/60 bg-primary/10"><Icon name="Rocket" size={18} className="text-primary" /></span><span className="font-display text-lg font-semibold uppercase tracking-[0.18em]">Cargo<span className="text-primary">Nav</span></span></div><p className="mt-3 max-w-sm font-mono text-xs leading-relaxed text-muted-foreground">Некоммерческий фанатский инструмент для торговцев Star Citizen. Не связан с Cloud Imperium Games и Roberts Space Industries.</p></div>
      <div><h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Источники данных</h3><ul className="mt-3 space-y-2 font-mono text-xs text-muted-foreground"><li><a href="https://uexcorp.space/" target="_blank" rel="noreferrer noopener" className="story-link hover:text-foreground">UEX Corp — цены, терминалы, корабли</a></li><li><a href="https://sc-trade.tools/" target="_blank" rel="noreferrer noopener" className="story-link hover:text-foreground">SC Trade Tools — дополнительный торговый источник</a></li><li><a href="https://starcitizen.tools/" target="_blank" rel="noreferrer noopener" className="story-link hover:text-foreground">Star Citizen Wiki — справочный ресурс</a></li></ul></div>
      <div><h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Разделы</h3><ul className="mt-3 space-y-2 font-mono text-xs text-muted-foreground">{[{ id:'terminal',label:'Терминал расчёта'},{id:'routes',label:'Список маршрутов'},{id:'fleet',label:'Флот и вместимость'},{id:'faq',label:'Справка и FAQ'}].map((l)=><li key={l.id}><button type="button" className="story-link hover:text-foreground" onClick={() => document.getElementById(l.id)?.scrollIntoView({ behavior:'smooth', block:'start' })}>{l.label}</button></li>)}</ul></div>
    </div>
    <p className="mt-8 border-t border-border pt-5 font-mono text-[11px] text-muted-foreground">CargoNav · {new Date().getFullYear()} · данные обновляются игровым сообществом, проверяйте цены на месте перед крупной сделкой.</p>
  </div></footer>
}
