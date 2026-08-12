export const DEFAULT_PRICE_QUALITY_OPTIONS = Object.freeze({
  trustedSource: 'UEX',
  candidateSource: 'SC Trade Tools',
  exactRatioLimit: 2,
  rangeRatioLimit: 2.5,
  minRangeSamples: 3,
})

function listingSideKey(listing) {
  return `${listing.commodityKey}|${listing.locationKey}|${listing.action}`
}

function commoditySideKey(listing) {
  return `${listing.commodityKey}|${listing.action}`
}

function validPrice(listing) {
  return Number.isFinite(Number(listing?.price)) && Number(listing.price) > 0
}

function symmetricRatio(a, b) {
  const x = Number(a)
  const y = Number(b)
  if (!(x > 0) || !(y > 0)) return Number.POSITIVE_INFINITY
  return Math.max(x / y, y / x)
}

/**
 * SC Trade Tools documents /api/crowdsource/commodity-listings as unfiltered
 * data that may contain outliers. Compare those observations against UEX
 * before they can affect route ranking and profit calculations.
 */
export function filterCandidatePriceOutliers(candidateListings, trustedListings, options = {}) {
  const opts = { ...DEFAULT_PRICE_QUALITY_OPTIONS, ...options }
  const exact = new Map()
  const ranges = new Map()

  for (const listing of trustedListings || []) {
    if (!validPrice(listing)) continue
    if (opts.trustedSource && listing.source !== opts.trustedSource) continue

    const exactKey = listingSideKey(listing)
    const previous = exact.get(exactKey)
    if (!previous || Number(listing.updatedAt || 0) > Number(previous.updatedAt || 0)) exact.set(exactKey, listing)

    const rangeKey = commoditySideKey(listing)
    const values = ranges.get(rangeKey) || []
    values.push(Number(listing.price))
    ranges.set(rangeKey, values)
  }

  const accepted = []
  const rejected = []

  for (const listing of candidateListings || []) {
    if (!validPrice(listing)) {
      rejected.push({ listing, reason: 'invalid-price', ratio: null, referencePrice: null })
      continue
    }
    if (opts.candidateSource && listing.source !== opts.candidateSource) {
      accepted.push(listing)
      continue
    }

    const exactReference = exact.get(listingSideKey(listing))
    if (exactReference && validPrice(exactReference)) {
      const ratio = symmetricRatio(listing.price, exactReference.price)
      if (ratio > opts.exactRatioLimit) {
        rejected.push({ listing, reason: 'exact-source-disagreement', ratio, referencePrice: Number(exactReference.price) })
        continue
      }
      accepted.push(listing)
      continue
    }

    const range = ranges.get(commoditySideKey(listing)) || []
    if (range.length >= opts.minRangeSamples) {
      const low = Math.min(...range)
      const high = Math.max(...range)
      const price = Number(listing.price)
      if (price > high * opts.rangeRatioLimit) {
        rejected.push({ listing, reason: 'above-trusted-range', ratio: price / high, referencePrice: high })
        continue
      }
      if (price < low / opts.rangeRatioLimit) {
        rejected.push({ listing, reason: 'below-trusted-range', ratio: low / price, referencePrice: low })
        continue
      }
    }

    accepted.push(listing)
  }

  return { accepted, rejected }
}
