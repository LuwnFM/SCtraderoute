export const HISTORY_SCHEMA_VERSION = 1

export function historyKey(terminalId, commodityId) {
  const terminal = Number(terminalId)
  const commodity = Number(commodityId)
  if (!(terminal > 0) || !(commodity > 0)) return ''
  return `${terminal}:${commodity}`
}

export function compactHistoryRows(rows, maxPoints = 90) {
  const dedup = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = Number(row?.date_added || 0)
    const buy = Number(row?.price_buy || 0)
    const sell = Number(row?.price_sell || 0)
    if (!(date > 0) || (!(buy > 0) && !(sell > 0))) continue
    dedup.set(date, [date, buy > 0 ? buy : 0, sell > 0 ? sell : 0])
  }
  return [...dedup.values()].sort((a, b) => a[0] - b[0]).slice(-Math.max(1, Number(maxPoints) || 90))
}

export function historyPoints(entry, kind) {
  const index = kind === 'buy' ? 1 : 2
  return (entry?.rows || [])
    .map((row) => ({ t: Number(row?.[0] || 0), v: Number(row?.[index] || 0), kind }))
    .filter((point) => point.t > 0 && point.v > 0)
}

export function cacheEntryNeedsRefresh(entry, nowMs = Date.now(), refreshHours = 48) {
  if (!entry?.fetchedAt || !Array.isArray(entry.rows)) return true
  const fetched = Date.parse(entry.fetchedAt)
  if (!Number.isFinite(fetched)) return true
  return nowMs - fetched > Math.max(0, Number(refreshHours) || 0) * 3600_000
}
