import Icon from '@/components/ui/icon'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const STEPS = [
  { icon: 'Ship', title: 'Выберите корабль', text: 'Возьмите готовый объём трюма из базы кораблей или задайте свой в SCU — например, если летите с недогрузом.' },
  { icon: 'Wallet', title: 'Укажите бюджет', text: 'Расчёт учитывает, сколько груза вы реально можете выкупить на текущие aUEC, а не теоретический максимум.' },
  { icon: 'ListFilter', title: 'Настройте фильтры', text: 'Системы и терминалы, товар, supply/demand, свежесть цен, контейнеры, ROI и другие ограничения.' },
  { icon: 'TrendingUp', title: 'Летите по маршруту', text: 'В разборе рейса видны вложения, выручка, supply/demand, отдельная свежесть buy/sell, путь между системами и источники.' },
]
const FAQ = [
  { q: 'Откуда берутся цены и запасы?', a: 'CargoNav агрегирует community-данные UEX и SC Trade Tools. GitHub Actions регулярно обновляет единый нормализованный snapshot; если один источник временно недоступен, рабочий предыдущий snapshot не должен исчезать.' },
  { q: 'Насколько свежие данные?', a: 'Для каждого маршрута отдельно показывается возраст цены покупки и цены продажи. Общая свежесть маршрута определяется более старой стороной сделки, поэтому новая buy-цена не маскирует старую sell-цену.' },
  { q: 'Почему прибыль меньше, чем разница цен на весь трюм?', a: 'Фактический объём ограничивается минимумом из вместимости корабля, бюджета, supply на точке закупки и demand на точке продажи. Если supply/demand неизвестны, это отмечается отдельно.' },
  { q: 'Как считаются межсистемные маршруты?', a: 'Для Stanton, Pyro и Nyx CargoNav строит последовательность систем через jump points. Это не полноценный навигационный симулятор, но межсистемная сделка не считается обычным локальным перелётом.' },
  { q: 'Где данные о вместимости кораблей?', a: 'Характеристики кораблей берутся из community-базы UEX и не называются официальными данными CIG. В расчёте также можно задать свой объём SCU вручную.' },
  { q: 'Сайт можно разместить на GitHub Pages?', a: 'Да. Интерфейс — статическое React/Vite-приложение, а торговый snapshot обновляется по расписанию в GitHub Actions и публикуется вместе со сборкой.' },
  { q: 'Учитывается ли топливо и риск?', a: 'Пока нет полноценного расчёта стоимости топлива и риска. Дистанции и jump-path хранятся как основа для дальнейшего расчёта времени и fuel economics.' },
]

export function FaqSection() {
  return <section id="faq" className="scroll-mt-20 border-t border-border py-16 sm:py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6">
    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">Инструкция</p><h2 className="mt-2 font-display text-3xl font-semibold uppercase tracking-tight sm:text-4xl">Как собрать прибыльный рейс</h2>
    <ol className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">{STEPS.map((s, i) => <li key={s.title} className="bg-card p-5"><div className="mb-3 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center border border-primary/50 bg-primary/10"><Icon name={s.icon} size={18} className="text-primary" /></span><span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Шаг {i + 1}</span></div><h3 className="font-display text-base font-semibold uppercase tracking-[0.06em]">{s.title}</h3><p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{s.text}</p></li>)}</ol>
    <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]"><div><h3 className="font-display text-2xl font-semibold uppercase tracking-tight">Частые вопросы</h3><p className="mt-2 font-mono text-sm text-muted-foreground">Коротко о том, как устроен расчёт и на что можно полагаться.</p></div><Accordion type="single" collapsible className="w-full">{FAQ.map((item, i) => <AccordionItem key={item.q} value={`item-${i}`}><AccordionTrigger className="text-left font-display text-base uppercase tracking-[0.04em]">{item.q}</AccordionTrigger><AccordionContent className="font-mono text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent></AccordionItem>)}</Accordion></div>
  </div></section>
}
