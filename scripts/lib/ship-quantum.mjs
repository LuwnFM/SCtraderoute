function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveNumber(value) {
  const number = finiteNumber(value)
  return number != null && number > 0 ? number : null
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value)
  return number != null && number >= 0 ? number : null
}

export function flattenVehiclePorts(ports) {
  const out = []
  const visit = (list) => {
    for (const port of Array.isArray(list) ? list : []) {
      if (!port || typeof port !== 'object') continue
      out.push(port)
      visit(port.ports)
    }
  }
  visit(ports)
  return out
}

function isQuantumDrivePort(port) {
  const item = port?.equipped_item || {}
  const values = [port?.type, item?.type, item?.classification, item?.classification_label, item?.class_name]
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''))
  return values.some((value) => value.includes('quantumdrive'))
}

/**
 * Extract the stock quantum-drive profile exposed by StarCitizenWiki API.
 * The API is generated from scunpacked game data. Vehicle show routes expose
 * resolved loadout ports, and QuantumDrive items include the same specification
 * fields used by the StarCitizenWiki quantum travel calculator.
 */
export function extractShipQuantumProfile(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return null
  const top = vehicle.quantum || {}
  const port = flattenVehiclePorts(vehicle.ports).find(isQuantumDrivePort)
  const item = port?.equipped_item || null
  const drive = item?.quantum_drive || item?.quantumDrive || {}
  const standard = drive?.standard_jump || drive?.standardJump || {}
  const travelTime10 = drive?.travel_time_10gm || drive?.travelTime10gm || {}

  const profile = {
    source: 'StarCitizenWiki/scunpacked',
    sourceVersion: item?.version || vehicle?.version || null,
    driveUuid: item?.uuid || port?.equipped_item_uuid || null,
    driveName: item?.name || null,
    driveClassName: item?.class_name || null,
    driveSize: positiveNumber(item?.size),
    travelTime10GmSeconds: positiveNumber(travelTime10?.seconds),
    quantumSpeedMps: positiveNumber(standard?.drive_speed ?? standard?.driveSpeed ?? top?.quantum_speed),
    spoolUpTimeSeconds: nonNegativeNumber(standard?.spool_up_time ?? standard?.spoolUpTime ?? top?.quantum_spool_time),
    calibrationDelaySeconds: nonNegativeNumber(standard?.calibration_delay_in_seconds ?? standard?.calibrationDelayInSeconds),
    cooldownTimeSeconds: nonNegativeNumber(standard?.cooldown_time ?? standard?.cooldownTime),
    fuelConsumptionScuPerGm: positiveNumber(drive?.fuel_consumption_scu_per_gm ?? drive?.fuelConsumptionScuPerGm),
    rangeMeters: positiveNumber(drive?.jump_range ?? drive?.jumpRange ?? top?.quantum_range),
  }

  const hasUsefulData = [
    profile.travelTime10GmSeconds,
    profile.quantumSpeedMps,
    profile.spoolUpTimeSeconds,
    profile.calibrationDelaySeconds,
  ].some((value) => value != null)

  return hasUsefulData ? profile : null
}

export function isQuantumCacheFresh(entry, now = Date.now(), refreshHours = 24) {
  const fetchedAt = Date.parse(String(entry?.fetchedAt || ''))
  if (!Number.isFinite(fetchedAt)) return false
  return now - fetchedAt < Math.max(1, Number(refreshHours) || 24) * 3_600_000
}
