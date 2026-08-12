export interface TravelTimeTerminal { name?: string; fullName?: string; location?: string }
export interface TravelTimeRoute { distanceGm?: number | null; profit?: number; from?: TravelTimeTerminal; to?: TravelTimeTerminal; path?: { jumpCount?: number | null } }
export interface TravelTimeEstimate { totalSeconds: number; profitPerMinute: number | null; distanceGm: number; jumpCount: number; groundEndpoints: number; cruiseSeconds: number; endpointSeconds: number; jumpSeconds: number; model: string }
export const TRAVEL_TIME_MODEL: Readonly<{ secondsPerGm: number; groundEndpointSeconds: number; jumpSeconds: number; minimumSeconds: number }>
export function isLikelyGroundTerminal(terminal?: TravelTimeTerminal): boolean
export function estimateTravelTime(route: TravelTimeRoute, model?: typeof TRAVEL_TIME_MODEL): TravelTimeEstimate | null
export function formatTravelDuration(totalSeconds: number | null | undefined): string
