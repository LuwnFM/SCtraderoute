export const TRAVEL_TIME_MODEL = Object.freeze({
  secondsPerGm: 4.37,
  groundEndpointSeconds: 75,
  jumpSeconds: 90,
  minimumSeconds: 30,
})

const GROUND_HINTS = [
  'mining area', 'mining facility', 'hdms-', 'rayari ', 'shubin ', 'outpost',
  'scrap', 'salvage', 'yard', 'fallow field', 'shepherd', 'rustville',
  'last landings', 'ashland', 'checkmate', 'rappel', 'brio', 'deakins', 'hickes',
]

const ORBITAL_HINTS = [
  'station', 'gateway', 'harbor', 'seraphim', 'port tressler', 'baijini point',
  'grimhex', 'cru-l', 'hur-l', 'mic-l', 'arc-l',
]

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9а-я]+/g, ' ').trim()
}

export function isLikelyGroundTerminal(terminal = {}) {
  const text = normalize(`${terminal.name || ''} ${terminal.fullName || ''} ${terminal.location || ''}`)
  if (ORBITAL_HINTS.some((hint) => text.includes(normalize(hint)))) return false
  return GROUND_HINTS.some((hint) => text.includes(normalize(hint)))
}

export function estimateTravelTime(route, model = TRAVEL_TIME_MODEL) {
  if (route?.distanceGm == null || route?.distanceGm === '') return null
  const distanceGm = Number(route.distanceGm)
  if (!Number.isFinite(distanceGm) || distanceGm < 0) return null
  const jumpCount = Math.max(0, Number(route?.path?.jumpCount) || 0)
  const groundEndpoints = [route?.from, route?.to].filter((terminal) => isLikelyGroundTerminal(terminal)).length
  const cruiseSeconds = distanceGm * Number(model.secondsPerGm)
  const endpointSeconds = groundEndpoints * Number(model.groundEndpointSeconds)
  const jumpSeconds = jumpCount * Number(model.jumpSeconds)
  const totalSeconds = Math.max(Number(model.minimumSeconds), Math.round(cruiseSeconds + endpointSeconds + jumpSeconds))
  const profit = Number(route?.profit)
  const profitPerMinute = Number.isFinite(profit) && totalSeconds > 0 ? profit / (totalSeconds / 60) : null
  return { totalSeconds, profitPerMinute, distanceGm, jumpCount, groundEndpoints, cruiseSeconds, endpointSeconds, jumpSeconds, model: 'distance-beta-v1' }
}

export function formatTravelDuration(totalSeconds) {
  if (!Number.isFinite(Number(totalSeconds)) || Number(totalSeconds) < 0) return 'нет данных'
  const seconds = Math.round(Number(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours} ч ${minutes} мин`
  if (minutes > 0) return `${minutes} мин ${rest} с`
  return `${rest} с`
}
