export interface Commodity {
  key: string
  uexId?: number
  name: string
  code?: string
  isIllegal?: boolean
  kind?: string | null
}

export interface Terminal {
  key: string
  uexId?: number
  name: string
  fullName?: string
  system: string
  location: string
  maxContainerSize?: number
  hasFreightElevator?: boolean
  isPlayerOwned?: boolean
  aliases?: string[]
}

export interface Ship {
  id: number | string
  name: string
  scu: number
  manufacturer?: string
  crew?: string
  containerSizes?: number[]
  quantumFuel?: number
  hydrogenFuel?: number
  isCargo?: boolean
  isGroundVehicle?: boolean
  isConcept?: boolean
  isSpaceship?: boolean
  isQuantumCapable?: boolean
}

export interface Listing {
  key: string
  commodityKey: string
  commodityName?: string
  locationKey: string
  action: 'SELLS' | 'BUYS'
  price: number
  quantity?: number | null
  boxSizes?: number[]
  updatedAt?: number
  source?: string
}

export interface DistanceRow { fromKey: string; toKey: string; distanceGm: number; source?: string }
export interface JumpPoint { from: string; to: string; fromOrbit?: string; toOrbit?: string; source?: string }
export interface SnapshotMeta { generatedAt: string; gameVersion?: string; schemaVersion?: number; sourceReports?: Array<{ name: string; ok: boolean; note?: string }> }
export interface TradeSnapshot { meta: SnapshotMeta; commodities: Commodity[]; terminals: Terminal[]; ships: Ship[]; jumpPoints: JumpPoint[]; listings: Listing[]; distances: DistanceRow[] }

function normalizeSnapshot(raw: Partial<TradeSnapshot>): TradeSnapshot {
  return {
    meta: raw.meta ?? { generatedAt: new Date(0).toISOString() },
    commodities: Array.isArray(raw.commodities) ? raw.commodities : [],
    terminals: Array.isArray(raw.terminals) ? raw.terminals : [],
    ships: Array.isArray(raw.ships) ? raw.ships : [],
    jumpPoints: Array.isArray(raw.jumpPoints) ? raw.jumpPoints : [],
    listings: Array.isArray(raw.listings) ? raw.listings : [],
    distances: Array.isArray(raw.distances) ? raw.distances : [],
  }
}

export async function loadTradeSnapshot(opts: { bust?: boolean; signal?: AbortSignal } = {}): Promise<TradeSnapshot> {
  const base = import.meta.env.BASE_URL || '/'
  const suffix = opts.bust ? `?v=${Date.now()}` : ''
  const response = await fetch(`${base}data/trade-snapshot.json${suffix}`, { cache: opts.bust ? 'no-store' : 'default', signal: opts.signal })
  if (!response.ok) throw new Error(`Не удалось загрузить trade snapshot: HTTP ${response.status}`)
  const raw = await response.json() as Partial<TradeSnapshot>
  const snapshot = normalizeSnapshot(raw)
  if (!snapshot.listings.length || !snapshot.terminals.length || !snapshot.commodities.length) throw new Error('Trade snapshot пуст или повреждён')
  return snapshot
}

export function flightReadyShips(ships: Ship[]): Ship[] {
  return ships
    .filter((ship) => Number(ship.scu) > 0)
    .filter((ship) => ship.isGroundVehicle !== true && ship.isConcept !== true && ship.isSpaceship !== false)
    .sort((a, b) => Number(b.scu) - Number(a.scu) || a.name.localeCompare(b.name))
}
