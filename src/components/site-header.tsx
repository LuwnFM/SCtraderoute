import { useEffect, useState } from 'react'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LINKS = [
  { id: 'terminal', label: 'Терминал' },
  { id: 'routes', label: 'Маршруты' },
  { id: 'fleet', label: 'Флот' },
  { id: 'faq', label: 'Справка' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 24); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll) }, [])
  const go = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  return (
    <header className={cn('sticky top-0 z-50 border-b transition-colors duration-300', scrolled ? 'border-border bg-background/90 backdrop-blur-md' : 'border-transparent bg-transparent')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center border border-primary/60 bg-primary/10"><Icon name="Rocket" size={18} className="text-primary" /></span>
          <span className="leading-tight"><span className="block font-display text-lg font-semibold uppercase tracking-[0.18em] text-foreground">Cargo<span className="text-primary">Nav</span></span><span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">trade terminal</span></span>
        </a>
        <nav aria-label="Основная навигация" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => <button key={l.id} type="button" onClick={() => go(l.id)} className="px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary">{l.label}</button>)}
          <Button size="sm" className="ml-3 font-mono text-xs uppercase tracking-[0.14em]" onClick={() => go('terminal')}><Icon name="Radar" size={15} className="mr-1.5" />Найти рейс</Button>
        </nav>
        <Button variant="outline" size="icon" className="md:hidden" aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name={open ? 'X' : 'Menu'} size={20} /></Button>
      </div>
      {open && <div className="border-t border-border bg-background/95 backdrop-blur-md md:hidden"><nav aria-label="Мобильная навигация" className="mx-auto max-w-7xl px-4 py-3">{LINKS.map((l) => <button key={l.id} type="button" onClick={() => go(l.id)} className="block w-full border-b border-border/60 px-1 py-3 text-left font-mono text-sm uppercase tracking-[0.16em] text-foreground last:border-0">{l.label}</button>)}</nav></div>}
    </header>
  )
}
