export const TRAVEL_TIME_MODEL = Object.freeze({
  // Fallback only. Calibrated against UEX/SC Trade Tools distance/ETA examples
  // when no selected ship or no stock-drive game profile is available.
  secondsPerGm: 8.635,
  groundEndpointSeconds: 0,
  jumpSeconds: 0,
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

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nonNegative(value, fallback = 0) {
  const number = numberOrNull(value)
  return number != null && number >= 0 ? number : fallback
}

function resolveOptions(optionsOrModel) {
  if (optionsOrModel && typeof optionsOrModel === 'object' && 'secondsPerGm' in optionsOrModel && !('ship' in optionsOrModel)) {
    return { ship: null, fallbackModel: optionsOrModel }
  }
  return {
    ship: optionsOrModel?.ship || null,
    fallbackModel: optionsOrModel?.fallbackModel || TRAVEL_TIME_MODEL,
  }
}

export function isLikelyGroundTerminal(terminal = {}) {
  const text = normalize(`${terminal.name || ''} ${terminal.fullName || ''} ${terminal.location || ''}`)
  if (ORBITAL_HINTS.some((hint) => text.includes(normalize(hint)))) return false
  return GROUND_HINTS.some((hint) => text.includes(normalize(hint)))
}

/**
 * Estimate the known minimum trip time.
 *
 * Preferred model: selected ship's stock QuantumDrive profile sourced from
 * StarCitizenWiki/scunpacked. TravelTime10GM is scaled by UEX distance, while
 * spool and calibration are kept as explicit components. Jump-point transit,
 * atmosphere/docking, cargo loading/unloading and inventory wait time are not
 * invented and therefore remain unknown overhead.
 *
 * Fallback: historical UEX/SC Trade Tools distance calibration used by beta v2.
 */
export function estimateTravelTime(route, optionsOrModel = {}) {
  if (route?.distanceGm == null || route?.distanceGm === '') return null
  const distanceGm = Number(route.distanceGm)
  if (!Number.isFinite(distanceGm) || distanceGm < 0) return null

  const { ship, fallbackModel } = resolveOptions(optionsOrModel)
  const drive = ship?.quantumDrive || null
  const travelTime10GmSeconds = numberOrNull(drive?.travelTime10GmSeconds)
  const hasGameTravel = travelTime10GmSeconds != null && travelTime10GmSeconds > 0
  const jumpCount = Math.max(0, Number(route?.path?.jumpCount) || 0)
  const groundEndpoints = [route?.from, route?.to].filter((terminal) => isLikelyGroundTerminal(terminal)).length

  const cruiseSeconds = hasGameTravel
    ? (distanceGm / 10) * travelTime10GmSeconds
    : distanceGm * Number(fallbackModel.secondsPerGm)
  const spoolSeconds = hasGameTravel ? nonNegative(drive?.spoolUpTimeSeconds) : 0
  const calibrationSeconds = hasGameTravel ? nonNegative(drive?.calibrationDelaySeconds) : 0
  const cooldownSeconds = hasGameTravel ? nonNegative(drive?.cooldownTimeSeconds) : 0

  // Intentionally zero until a documented source provides route-specific values.
  const endpointSeconds = groundEndpoints * Number(fallbackModel.groundEndpointSeconds || 0)
  const jumpSeconds = jumpCount * Number(fallbackModel.jumpSeconds || 0)
  const knownSeconds = cruiseSeconds + spoolSeconds + calibrationSeconds + endpointSeconds + jumpSeconds
  const totalSeconds = Math.max(Number(fallbackModel.minimumSeconds || 0), Math.round(knownSeconds))
  const profit = Number(route?.profit)
  const profitPerMinute = Number.isFinite(profit) && totalSeconds > 0 ? profit / (totalSeconds / 60) : null

  const unknownSegments = ['погрузка/разгрузка', 'стыковка/атмосферный участок']
  if (jumpCount > 0) unknownSegments.push('время прохождения jump point')

  return {
    totalSeconds,
    knownSeconds,
    profitPerMinute,
    distanceGm,
    jumpCount,
    groundEndpoints,
    cruiseSeconds,
    spoolSeconds,
    calibrationSeconds,
    cooldownSeconds,
    endpointSeconds,
    jumpSeconds,
    model: hasGameTravel ? 'game-data-quantum-v1' : 'uex-distance-beta-v2',
    source: hasGameTravel ? String(drive?.source || 'StarCitizenWiki/scunpacked') : 'UEX/SC Trade Tools calibration',
    sourceVersion: hasGameTravel ? (drive?.sourceVersion || null) : null,
    shipName: ship?.name || null,
    driveName: drive?.driveName || null,
    travelTime10GmSeconds: hasGameTravel ? travelTime10GmSeconds : null,
    quantumSpeedMps: numberOrNull(drive?.quantumSpeedMps),
    fuelConsumptionScuPerGm: numberOrNull(drive?.fuelConsumptionScuPerGm),
    isGameData: hasGameTravel,
    isLowerBound: true,
    unknownSegments,
  }
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
