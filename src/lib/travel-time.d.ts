import type { Ship } from './data'

export interface TravelTimeTerminal { name?: string; fullName?: string; location?: string }
export interface TravelTimeJump {
  jumpTunnelMinSeconds?: number | null
  jumpTunnelMaxSeconds?: number | null
  jumpTunnelDeterministic?: boolean | null
  jumpTunnelTimingSource?: string | null
}
export interface TravelTimeRoute {
  distanceGm?: number | null
  profit?: number
  from?: TravelTimeTerminal
  to?: TravelTimeTerminal
  path?: { jumpCount?: number | null; jumps?: TravelTimeJump[] }
}
export interface TravelTimeEstimate {
  totalSeconds: number
  knownSeconds: number
  profitPerMinute: number | null
  totalSecondsMin: number
  totalSecondsMax: number
  knownSecondsMin: number
  knownSecondsMax: number
  profitPerMinuteMin: number | null
  profitPerMinuteMax: number | null
  hasTravelRange: boolean
  distanceGm: number
  jumpCount: number
  groundEndpoints: number
  cruiseSeconds: number
  spoolSeconds: number
  calibrationSeconds: number
  cooldownSeconds: number
  endpointSeconds: number
  jumpSeconds: number
  jumpSecondsMin: number
  jumpSecondsMax: number
  jumpTimingSource: string | null
  jumpTimingFallbackCount: number
  model: string
  source: string
  sourceVersion: string | null
  shipName: string | null
  driveName: string | null
  travelTime10GmSeconds: number | null
  quantumSpeedMps: number | null
  fuelConsumptionScuPerGm: number | null
  isGameData: boolean
  isLowerBound: boolean
  unknownSegments: string[]
}
export const TRAVEL_TIME_MODEL: Readonly<{ secondsPerGm: number; groundEndpointSeconds: number; jumpSeconds: number; minimumSeconds: number }>
export const JUMP_TUNNEL_FALLBACK_RANGE: Readonly<{ minSecondsPerJump: number; maxSecondsPerJump: number; deterministic: boolean; source: string }>
export function isLikelyGroundTerminal(terminal?: TravelTimeTerminal): boolean
export function estimateTravelTime(route: TravelTimeRoute, optionsOrModel?: { ship?: Ship | null; fallbackModel?: typeof TRAVEL_TIME_MODEL } | typeof TRAVEL_TIME_MODEL): TravelTimeEstimate | null
export function formatTravelDuration(totalSeconds: number | null | undefined): string
export function formatTravelDurationRange(minSeconds: number | null | undefined, maxSeconds: number | null | undefined): string
