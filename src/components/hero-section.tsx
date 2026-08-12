import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/routes'

interface HeroSectionProps { terminals: number; commodities: number; ships: number; loading: boolean; sourceLabel: string }
const HERO_IMAGE = 'https://cdn.poehali.dev/projects/ed5efeac-d10b-4cb5-967b-999219bb7015/files/d3652e88-23b6-4622-b939-6b0d39dc5a04.jpg'

export function HeroSection({ terminals, commodities, ships, loading, sourceLabel }: HeroSectionProps) {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const stats = [
    { label: 'Торговых терминалов', value: terminals, icon: 'Building2' },
    { label: 'Товаров в базе', value: commodities, icon: 'Package' },
    { label: 'Кораблей с трюмом', value: ships, icon: 'Rocket' },
  ]
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img src={HERO_IMAGE} alt="Грузовой корабль у орбитальной станции" className="h-full w-full object-cover opacity-40" loading="eager" decoding="async" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="absolute inset-0 hud-grid opacity-40" />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <div className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="animate-fade-in">
            <p className="mb-5 inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-primary"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />{sourceLabel}</p>
            <h1 className="font-display text-4xl font-semibold uppercase leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">Торговые маршруты<span className="block text-primary text-glow">Star Citizen</span></h1>
            <p className="mt-6 max-w-xl font-mono text-sm leading-relaxed text-muted-foreground sm:text-base">Терминал подбирает прибыльные рейсы для Stanton, Pyro и Nyx с учётом корабля, бюджета, supply/demand, свежести цен, контейнеров и межсистемных переходов.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="font-mono uppercase tracking-[0.14em]" onClick={() => go('terminal')}><Icon name="Radar" size={18} className="mr-2" />Рассчитать рейс</Button>
              <Button size="lg" variant="outline" className="font-mono uppercase tracking-[0.14em]" onClick={() => go('fleet')}><Icon name="Ship" size={18} className="mr-2" />Выбрать корабль</Button>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-1">
            {stats.map((s, i) => <div key={s.label} className="flex items-center gap-4 bg-card/90 p-5 backdrop-blur-sm animate-fade-in" style={{ animationDelay: `${120 + i * 90}ms` }}><Icon name={s.icon} size={22} className="shrink-0 text-primary" /><div><dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{s.label}</dt><dd className="font-display text-2xl font-semibold tabular-nums text-foreground">{loading ? '···' : formatNumber(s.value)}</dd></div></div>)}
          </dl>
        </div>
      </div>
      <div className="amber-line h-px w-full" />
    </section>
  )
}
