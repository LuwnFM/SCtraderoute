export const TRAVEL_TIME_MODEL = Object.freeze({
  // Fallback only. Calibrated against UEX/SC Trade Tools distance/ETA examples
  // when no selected ship or no stock-drive game profile is available.
  secondsPerGm: 8.635,
  groundEndpointSeconds: 0,
  jumpSeconds: 0,
  minimumSeconds: 30,
})

export const JUMP_TUNNEL_FALLBACK_RANGE = Object.freeze({
  minSecondsPerJump: 30,
  maxSecondsPerJump: 180,
  deterministic: false,
  source: 'operational-observation',
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

function resolveJumpTunnelRange(route, jumpCount) {
  if (!(jumpCount > 0)) {
    return { minSeconds: 0, maxSeconds: 0, source: null, fallbackCount: 0 }
  }

  const jumps = Array.isArray(route?.path?.jumps) ? route.path.jumps : []
  let minSeconds = 0
  let maxSeconds = 0
  let fallbackCount = 0
  const sources = new Set()

  for (let index = 0; index < jumpCount; index += 1) {
    const edge = jumps[index]
    const edgeMin = numberOrNull(edge?.jumpTunnelMinSeconds)
    const edgeMax = numberOrNull(edge?.jumpTunnelMaxSeconds)
    if (edgeMin != null && edgeMax != null && edgeMin >= 0 && edgeMax >= edgeMin) {
      minSeconds += edgeMin
      maxSeconds += edgeMax
      if (edge?.jumpTunnelTimingSource) sources.add(String(edge.jumpTunnelTimingSource))
      continue
    }

    minSeconds += JUMP_TUNNEL_FALLBACK_RANGE.minSecondsPerJump
    maxSeconds += JUMP_TUNNEL_FALLBACK_RANGE.maxSecondsPerJump
    fallbackCount += 1
    sources.add(JUMP_TUNNEL_FALLBACK_RANGE.source)
  }

  return {
    minSeconds,
    maxSeconds,
    source: [...sources].join(' + ') || JUMP_TUNNEL_FALLBACK_RANGE.source,
    fallbackCount,
  }
}

export function isLikelyGroundTerminal(terminal = {}) {
  const text = normalize(`${terminal.name || ''} ${terminal.fullName || ''} ${terminal.location || ''}`)
  if (ORBITAL_HINTS.some((hint) => text.includes(normalize(hint)))) return false
  return GROUND_HINTS.some((hint) => text.includes(normalize(hint)))
}

/**
 * Estimate the known flight-time range.
 *
 * Preferred model: selected ship's stock QuantumDrive profile sourced from
 * StarCitizenWiki/scunpacked. TravelTime10GM is scaled by UEX distance, while
 * spool and calibration are kept as explicit components.
 *
 * Current LIVE jump tunnels are non-deterministic. CargoNav therefore adds the
 * observed operational range carried by the LIVE topology (30-180 seconds per
 * jump at the moment) instead of inventing a fixed tunnel duration. If an older
 * snapshot lacks edge timing metadata, the same observed range is used as an
 * explicit fallback.
 *
 * Atmosphere/docking, cargo loading/unloading and inventory wait time are not
 * invented and remain unknown overhead above the displayed flight range.
 *
 * Fallback quantum model: historical UEX/SC Trade Tools distance calibration
 * used by beta v2 when no selected stock-drive game profile is available.
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
  const jumpRange = resolveJumpTunnelRange(route, jumpCount)
  const jumpSecondsMin = jumpRange.minSeconds
  const jumpSecondsMax = jumpRange.maxSeconds

  const baseKnownSeconds = cruiseSeconds + spoolSeconds + calibrationSeconds + endpointSeconds
  const knownSecondsMin = baseKnownSeconds + jumpSecondsMin
  const knownSecondsMax = baseKnownSeconds + jumpSecondsMax
  const totalSecondsMin = Math.max(Number(fallbackModel.minimumSeconds || 0), Math.round(knownSecondsMin))
  const totalSecondsMax = Math.max(totalSecondsMin, Math.max(Number(fallbackModel.minimumSeconds || 0), Math.round(knownSecondsMax)))
  const profit = Number(route?.profit)
  const profitPerMinuteMax = Number.isFinite(profit) && totalSecondsMin > 0 ? profit / (totalSecondsMin / 60) : null
  const profitPerMinuteMin = Number.isFinite(profit) && totalSecondsMax > 0 ? profit / (totalSecondsMax / 60) : null

  const unknownSegments = ['погрузка/разгрузка', 'стыковка/атмосферный участок']

  return {
    // Legacy scalar fields remain the optimistic edge of the known range so
    // existing callers do not silently become slower. New UI should use Min/Max.
    totalSeconds: totalSecondsMin,
    knownSeconds: knownSecondsMin,
    profitPerMinute: profitPerMinuteMax,
    totalSecondsMin,
    totalSecondsMax,
    knownSecondsMin,
    knownSecondsMax,
    profitPerMinuteMin,
    profitPerMinuteMax,
    hasTravelRange: totalSecondsMax > totalSecondsMin,
    distanceGm,
    jumpCount,
    groundEndpoints,
    cruiseSeconds,
    spoolSeconds,
    calibrationSeconds,
    cooldownSeconds,
    endpointSeconds,
    jumpSeconds: jumpSecondsMin,
    jumpSecondsMin,
    jumpSecondsMax,
    jumpTimingSource: jumpRange.source,
    jumpTimingFallbackCount: jumpRange.fallbackCount,
    model: hasGameTravel ? 'game-data-quantum-v2-range' : 'uex-distance-beta-v3-range',
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

export function formatTravelDurationRange(minSeconds, maxSeconds) {
  if (!Number.isFinite(Number(minSeconds)) || !Number.isFinite(Number(maxSeconds))) return 'нет данных'
  const min = Math.max(0, Number(minSeconds))
  const max = Math.max(min, Number(maxSeconds))
  const left = formatTravelDuration(min)
  const right = formatTravelDuration(max)
  return left === right ? left : `${left}–${right}`
}
