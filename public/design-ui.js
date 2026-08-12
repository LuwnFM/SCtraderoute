const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('https://api.uexcorp.space/2.0/commodities_prices_history')) {
    input = input.replace('https://api.uexcorp.space/2.0/', 'https://api.uexcorp.uk/2.0/')
  } else if (input instanceof Request && input.url.startsWith('https://api.uexcorp.space/2.0/commodities_prices_history')) {
    input = new Request(input.url.replace('https://api.uexcorp.space/2.0/', 'https://api.uexcorp.uk/2.0/'), input)
  }
  return nativeFetch(input, init)
}

const $ = (id) => document.getElementById(id)

function syncCapacityRange() {
  const number = $('capacity')
  const range = $('capacity-range')
  if (!number || !range) return
  const value = Math.max(1, Number(number.value) || 1)
  if (value > Number(range.max)) range.max = String(Math.ceil(value / 1000) * 1000)
  range.value = String(value)
}

function fireChange(el) {
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

$('capacity-range')?.addEventListener('input', (event) => {
  const number = $('capacity')
  if (!number) return
  number.value = event.currentTarget.value
  fireChange(number)
})
$('capacity')?.addEventListener('input', syncCapacityRange)
$('capacity')?.addEventListener('change', syncCapacityRange)
$('ship')?.addEventListener('change', () => setTimeout(syncCapacityRange, 0))
$('reset-filters')?.addEventListener('click', () => setTimeout(syncCapacityRange, 0))

const advanced = $('advanced-panel')
const advancedToggle = $('advanced-toggle')
advancedToggle?.addEventListener('click', () => {
  if (!advanced) return
  advanced.hidden = !advanced.hidden
  advancedToggle.setAttribute('aria-expanded', String(!advanced.hidden))
})

// Make sure anchor navigation lands like the original Poehali build beneath the sticky header.
document.querySelectorAll('[data-scroll]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    const id = button.dataset.scroll
    if (!id) return
    requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (!target) return
      const top = target.getBoundingClientRect().top + window.scrollY - 64
      window.scrollTo({ top, behavior: 'smooth' })
    })
  }, { capture: true })
})

syncCapacityRange()

// Match the original panel: show snapshot freshness as HH:MM, not a long locale timestamp.
nativeFetch(new URL('./data/trade-snapshot.json', import.meta.url))
  .then((response) => response.ok ? response.json() : null)
  .then((snapshot) => {
    const generatedAt = snapshot?.meta?.generatedAt
    if (!generatedAt) return
    const date = new Date(generatedAt)
    if (Number.isNaN(date.getTime())) return
    const el = $('snapshot-time')
    if (el) el.textContent = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  })
  .catch(() => {})
