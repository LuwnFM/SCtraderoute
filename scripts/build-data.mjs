import { mkdir, writeFile } from "node:fs/promises";

const SCTRADE_BASE = process.env.SCTRADE_BASE || "https://sc-trade.tools";
const OUT_FILE = "public/data/routes.json";

const CFG = {
  shipScu: intEnv("SHIP_SCU", 128),
  investment: intEnv("INVESTMENT_AUEC", 1_000_000),
  topN: intEnv("TOP_N", 300),
  minInventoryScu: intEnv("MIN_INVENTORY_SCU", 1),
  maxRouteRoiPct: numberEnv("MAX_ROUTE_ROI_PCT", 300),
  maxSellBuyRatio: numberEnv("MAX_SELL_BUY_RATIO", 4),
  maxProfitPerScu: numberEnv("MAX_PROFIT_PER_SCU", 0),

  scTradeShip: process.env.SCTRADE_SHIP || "Freelancer",
  scTradeProfitType: process.env.SCTRADE_PROFIT_TYPE || "time",
  scTradeMaxStops: intEnv("SCTRADE_MAX_STOPS", 1),
  scTradeSupportedBoxSize: intEnv("SCTRADE_SUPPORTED_BOX_SIZE_SCU", 32),
  scTradeUseToolRoutes: boolEnv("SCTRADE_USE_TOOL_ROUTES", true),

  scTradeCrowdsource: boolEnv("SCTRADE_USE_CROWDSOURCE", true),
  scTradeCrowdsourceMaxPages: intEnv("SCTRADE_CROWD_MAX_PAGES", 20),
  scTradeCrowdsourceMaxAgeDays: intEnv("SCTRADE_CROWD_MAX_AGE_DAYS", 21),
  scTradeCrowdsourceMinQuantityScu: intEnv("SCTRADE_CROWD_MIN_QUANTITY_SCU", 1),
  scTradeCrowdsourceRequireBoxCompatibility: boolEnv("SCTRADE_CROWD_REQUIRE_BOX_COMPAT", false)
};

const sourceReports = [];
let allRoutes = [];

await runSource("SC Trade Tools tool routes", async () => {
  if (!CFG.scTradeUseToolRoutes) return "skipped: SCTRADE_USE_TOOL_ROUTES=false";
  if (!process.env.SCTRADE_TOKEN) {
    return "skipped: SCTRADE_TOKEN is not set; /api/tools/trades requires a token, public crowdsource remains enabled";
  }
  const routes = await fetchScTradeToolRoutes();
  allRoutes.push(...routes);
  return `loaded ${routes.length} routes from /api/tools/trades`;
});

await runSource("SC Trade Tools crowdsource", async () => {
  if (!CFG.scTradeCrowdsource) return "skipped: SCTRADE_USE_CROWDSOURCE=false";
  const routes = await fetchScTradeCrowdsourceRoutes();
  allRoutes.push(...routes);
  return `calculated ${routes.length} routes from /api/crowdsource/commodity-listings`;
});

const filteredRoutes = filterUnrealisticRoutes(allRoutes);
const routes = mergeComparableRoutes(filteredRoutes)
  .sort((a, b) => numeric(b.profitPerMinute) - numeric(a.profitPerMinute) || numeric(b.profit) - numeric(a.profit))
  .slice(0, CFG.topN);

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "SC Trade Tools Swagger API only",
    baseUrl: SCTRADE_BASE,
    openApiUrl: `${SCTRADE_BASE}/v3/api-docs`,
    swaggerUiUrl: `${SCTRADE_BASE}/swagger-ui/index.html`,
    params: CFG,
    sourceReports
  },
  routes
};

// Ensure loadScu is an integer in the final output and recompute dependent fields.
for (const r of output.routes || []) {
  const n = Number(r.loadScu);
  if (Number.isFinite(n)) {
    const load = Math.max(0, Math.floor(n + 1e-9));
    r.loadScu = load;
    const buy = Number(r.buyPrice);
    const ppsc = Number(r.profitPerScu);
    if (Number.isFinite(buy) && load > 0) r.investmentRequired = round2(buy * load);
    if (Number.isFinite(ppsc) && load > 0) r.profit = round2(load * ppsc);
    if (Number.isFinite(r.investmentRequired) && r.investmentRequired > 0) {
      r.roiPct = round2((Number(r.profit) / Number(r.investmentRequired)) * 100);
    }
  }
}

await mkdir("public/data", { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote ${routes.length} routes to ${OUT_FILE}`);

if (!routes.length && !boolEnv("ALLOW_EMPTY_ROUTES", false)) {
  throw new Error("No routes were generated. Check SC Trade Tools API connectivity, filters, and SCTRADE_TOKEN if you enabled token-protected endpoints. Set ALLOW_EMPTY_ROUTES=true only for local placeholder builds.");
}

async function runSource(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const note = await fn();
    sourceReports.push({ name, ok: true, note, startedAt, finishedAt: new Date().toISOString() });
    console.log(`[${name}] ${note}`);
  } catch (error) {
    const note = error?.message || String(error);
    sourceReports.push({ name, ok: false, note, startedAt, finishedAt: new Date().toISOString() });
    console.warn(`[${name}] ${note}`);
  }
}

async function fetchScTradeToolRoutes() {
  const payload = {
    locationNames: splitEnv("SCTRADE_LOCATION_NAMES"),
    locationNamesType: process.env.SCTRADE_LOCATION_NAMES_TYPE || "blacklist",
    locationTypes: splitEnv("SCTRADE_LOCATION_TYPES"),
    locationTypesType: process.env.SCTRADE_LOCATION_TYPES_TYPE || "blacklist",
    factionNames: splitEnv("SCTRADE_FACTION_NAMES"),
    factionsNamesType: process.env.SCTRADE_FACTION_NAMES_TYPE || "blacklist",

    minSecurityLevel: intEnv("SCTRADE_MIN_SECURITY_LEVEL", 0),
    supportedBoxSizeInScu: CFG.scTradeSupportedBoxSize,
    avoidHiddenLocations: boolEnv("SCTRADE_AVOID_HIDDEN_LOCATIONS", true),

    commodityNames: splitEnv("SCTRADE_COMMODITY_NAMES"),
    commodityNamesType: process.env.SCTRADE_COMMODITY_NAMES_TYPE || "blacklist",
    commodityTypes: splitEnv("SCTRADE_COMMODITY_TYPES"),
    commodityTypesType: process.env.SCTRADE_COMMODITY_TYPES_TYPE || "blacklist",

    maxVolume: 1,
    investment: CFG.investment,
    profitType: CFG.scTradeProfitType,
    ship: CFG.scTradeShip,
    maxStops: CFG.scTradeMaxStops,
    allowWaitTimes: boolEnv("SCTRADE_ALLOW_WAIT_TIMES", false),
    useAutoLoading: boolEnv("SCTRADE_USE_AUTO_LOADING", false),
    smartFilters: boolEnv("SCTRADE_SMART_FILTERS", true),
    minInventorySizeInScu: CFG.minInventoryScu
  };

  if (process.env.SCTRADE_ORIGIN) payload.origin = process.env.SCTRADE_ORIGIN;

  const rows = await fetchJson(`${SCTRADE_BASE}/api/tools/trades`, {
    method: "POST",
    headers: scTradeHeaders(true),
    body: JSON.stringify(payload)
  });

  const trades = Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : [];
  return trades.map(normalizeScTradeToolRoute).filter((r) => numeric(r.profit) > 0);
}

function normalizeScTradeToolRoute(trade) {
  const origin = trade.origin || {};
  const destination = trade.destination || {};
    const rawLoadScu = firstNumber(origin.quantityInScu, origin.itemQuantityInScu, destination.quantityInScu, null);
    const loadScu = rawLoadScu ? floorScu(rawLoadScu) : null;
  const buyPrice = firstNumber(origin.price, null);
  const sellPrice = firstNumber(destination.price, null);
  const profit = firstNumber(trade.profit, null);
  const profitPerMinute = firstNumber(trade.profitPerMinute, null);

  return {
    id: stableId(["sctt-tool", trade.id, origin.location, origin.shop, destination.location, destination.shop, origin.itemName]),
    source: "SC Trade Tools /api/tools/trades",
    commodity: clean(origin.itemName || destination.itemName || "Unknown commodity"),
    origin: formatShop(origin),
    destination: formatShop(destination),
    buyPrice: round2OrNull(buyPrice),
    sellPrice: round2OrNull(sellPrice),
    profitPerScu: buyPrice && sellPrice ? round2(sellPrice - buyPrice) : null,
      loadScu,
    maxSupplyScu: firstNumber(origin.maxQuantityInScu, null),
    maxDemandScu: firstNumber(destination.maxQuantityInScu, null),
    investmentRequired: buyPrice && loadScu ? round2(buyPrice * loadScu) : null,
    profit: round2OrNull(profit),
    roiPct: buyPrice && loadScu && profit ? round2((profit / (buyPrice * loadScu)) * 100) : null,
    profitPerMinute: round2OrNull(profitPerMinute),
    timeInSeconds: firstNumber(trade.timeInSeconds, null),
    distanceGm: null,
    profitPerGm: null,
    quality: null,
    updatedAt: null,
    notes: ["Returned by SC Trade Tools Swagger API: POST /api/tools/trades"],
    sourceDetails: { tradeId: trade.id, origin, destination, timeInSeconds: trade.timeInSeconds }
  };
}

async function fetchScTradeCrowdsourceRoutes() {
  const rows = await fetchScTradeCrowdsourceListings();
  const listings = normalizeCrowdsourceListings(rows);
  const candidates = calculateRoutesFromListings(listings, {
    source: "SC Trade Tools /api/crowdsource/commodity-listings",
    note: "Calculated from SC Trade Tools public Swagger API: GET /api/crowdsource/commodity-listings; endpoint is cached server-side and unfiltered"
  });
  return candidates.sort((a, b) => numeric(b.profit) - numeric(a.profit)).slice(0, CFG.topN * 5);
}

async function fetchScTradeCrowdsourceListings() {
  const out = [];
  let page = 0;
  let totalPages = Number.POSITIVE_INFINITY;
  const maxPages = Math.max(1, CFG.scTradeCrowdsourceMaxPages);

  while (page < maxPages && page < totalPages) {
    const json = await fetchJson(`${SCTRADE_BASE}/api/crowdsource/commodity-listings?page=${page}`, {
      headers: scTradeHeaders(false)
    });

    const content = extractPageContent(json);
    out.push(...content);

    const pageInfo = json?.page || json?.metadata || json?.pageMetadata || json?.data?.page;
    const reportedTotalPages = Number(pageInfo?.totalPages);
    if (Number.isFinite(reportedTotalPages) && reportedTotalPages > 0) {
      totalPages = reportedTotalPages;
    } else if (!content.length) {
      break;
    }

    page += 1;
  }

  sourceReports.push({
    name: "SC Trade Tools crowdsource pages",
    ok: true,
    note: `fetched ${out.length} listings from ${page} page(s); max pages ${maxPages}; max age ${CFG.scTradeCrowdsourceMaxAgeDays} day(s)`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString()
  });

  return out;
}

function extractPageContent(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.content)) return json.content;
  if (Array.isArray(json?.data?.content)) return json.data.content;
  if (Array.isArray(json?.data)) return json.data;
  const embedded = json?._embedded;
  if (embedded && typeof embedded === "object") {
    for (const value of Object.values(embedded)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function normalizeCrowdsourceListings(rows) {
  const now = Date.now();
  const maxAgeMs = CFG.scTradeCrowdsourceMaxAgeDays > 0
    ? CFG.scTradeCrowdsourceMaxAgeDays * 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  const latestByKey = new Map();

  for (const row of rows) {
    const commodity = clean(row.commodity || row.itemName || row.item || row.commodity_name);
    const location = clean(row.location || row.shop || row.locationAndShop || row.terminal || row.terminal_name);
    const transaction = normalizeTransaction(row.transaction || row.action || row.type || row.side);
    const price = firstNumber(row.price, row.pricePerScu, row.price_per_scu, null);
    const quantity = firstNumber(row.quantity, row.quantityInScu, row.quantity_in_scu, row.maxQuantityInScu, row.available, null);
    const timestamp = parseDateIso(row.timestamp || row.updatedAt || row.date || row.createdAt);
    const boxSizes = normalizeBoxSizes(row.boxSizesInScu || row.box_sizes_in_scu || row.boxSizes || row.box_sizes);

    if (!commodity || !location || !transaction) continue;
    if (!(price > 0)) continue;
    if (quantity !== null && quantity < CFG.scTradeCrowdsourceMinQuantityScu) continue;
    if (timestamp) {
      const age = now - new Date(timestamp).getTime();
      if (Number.isFinite(age) && age > maxAgeMs) continue;
    }
    if (CFG.scTradeCrowdsourceRequireBoxCompatibility && boxSizes.length && !boxSizes.some((size) => size <= CFG.scTradeSupportedBoxSize)) {
      continue;
    }

    const listing = {
      commodity,
      location,
      transaction,
      price,
      quantity: quantity === null ? Number.POSITIVE_INFINITY : quantity,
      timestamp,
      boxSizes,
      raw: row
    };

    const key = [normalizeKey(commodity), normalizeKey(location), transaction].join("|");
    const previous = latestByKey.get(key);
    if (!previous || dateValue(listing.timestamp) >= dateValue(previous.timestamp)) {
      latestByKey.set(key, listing);
    }
  }

  return [...latestByKey.values()];
}

function calculateRoutesFromListings(listings, options) {
  const byCommodity = new Map();

  for (const listing of listings) {
    const key = normalizeKey(listing.commodity);
    if (!byCommodity.has(key)) byCommodity.set(key, { commodity: listing.commodity, origins: [], destinations: [] });
    const bucket = byCommodity.get(key);
    if (listing.transaction === "SELLS") bucket.origins.push(listing);
    if (listing.transaction === "BUYS") bucket.destinations.push(listing);
  }

  const candidates = [];

  for (const bucket of byCommodity.values()) {
    const origins = bucket.origins.sort((a, b) => a.price - b.price).slice(0, 80);
    const destinations = bucket.destinations.sort((a, b) => b.price - a.price).slice(0, 80);
    for (const origin of origins) {
      for (const destination of destinations) {
        if (normalizeKey(origin.location) === normalizeKey(destination.location)) continue;
        const profitPerScu = destination.price - origin.price;
        if (profitPerScu <= 0) continue;

        const maxByInvestment = CFG.investment > 0 ? CFG.investment / origin.price : CFG.shipScu;
        const loadScu = floorScu(Math.max(0, Math.min(
          CFG.shipScu,
          finiteOr(origin.quantity, CFG.shipScu),
          finiteOr(destination.quantity, CFG.shipScu),
          maxByInvestment
        )));
        if (loadScu <= 0) continue;

        const investmentRequired = round2(loadScu * origin.price);
        const profit = round2(loadScu * profitPerScu);
        const updatedAt = maxIso(origin.timestamp, destination.timestamp);

        candidates.push({
          id: stableId([options.source, bucket.commodity, origin.location, destination.location, origin.price, destination.price]),
          source: options.source,
          commodity: bucket.commodity,
          origin: origin.location,
          destination: destination.location,
          buyPrice: round2(origin.price),
          sellPrice: round2(destination.price),
          profitPerScu: round2(profitPerScu),
          loadScu,
          maxSupplyScu: finiteOrNull(origin.quantity),
          maxDemandScu: finiteOrNull(destination.quantity),
          investmentRequired,
          profit,
            roiPct: investmentRequired > 0 ? round2((profit / investmentRequired) * 100) : null,
          profitPerMinute: null,
          timeInSeconds: null,
          distanceGm: null,
          profitPerGm: null,
          quality: null,
          updatedAt,
          notes: [options.note, "Crowdsource data can contain outliers; verify expensive runs in-game before buying"],
          sourceDetails: {
            originRaw: origin.raw,
            destinationRaw: destination.raw,
            originBoxSizesInScu: origin.boxSizes,
            destinationBoxSizesInScu: destination.boxSizes
          }
        });

        if (candidates.length > CFG.topN * 30) {
          candidates.sort((a, b) => numeric(b.profit) - numeric(a.profit));
          candidates.length = CFG.topN * 10;
        }
      }
    }
  }

  return candidates;
}

function scTradeHeaders(withJsonBody) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "sc-trade-routes-pages-sc-only/1.0"
  };
  if (withJsonBody) headers["Content-Type"] = "application/json";
  if (process.env.SCTRADE_TOKEN) headers.token = process.env.SCTRADE_TOKEN;
  return headers;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 250)}`);
  }
  return res.json();
}

function filterUnrealisticRoutes(routes) {
  const filtered = [];
  const dropped = { roi: 0, ratio: 0, profitPerScu: 0 };

  for (const route of routes) {
    const buy = numeric(route.buyPrice);
    const sell = numeric(route.sellPrice);
    const roi = numeric(route.roiPct);
    const profitPerScu = numeric(route.profitPerScu);

    if (CFG.maxSellBuyRatio > 0 && buy > 0 && sell / buy > CFG.maxSellBuyRatio) {
      dropped.ratio += 1;
      continue;
    }
    if (CFG.maxRouteRoiPct > 0 && roi > CFG.maxRouteRoiPct) {
      dropped.roi += 1;
      continue;
    }
    if (CFG.maxProfitPerScu > 0 && profitPerScu > CFG.maxProfitPerScu) {
      dropped.profitPerScu += 1;
      continue;
    }
    filtered.push(route);
  }

  const totalDropped = dropped.roi + dropped.ratio + dropped.profitPerScu;
  if (totalDropped) {
    sourceReports.push({
      name: "Sanity filter",
      ok: true,
      note: `dropped ${totalDropped} unrealistic routes: ratio=${dropped.ratio}, roi=${dropped.roi}, profitPerScu=${dropped.profitPerScu}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    });
  }

  return filtered;
}

function sourcePriority(source) {
  const text = clean(source).toLowerCase();
  if (text.includes("/api/tools/trades")) return 100;
  if (text.includes("/api/crowdsource/commodity-listings")) return 90;
  if (text.includes("local csv")) return 80;
  return 10;
}

function mergeComparableRoutes(routes) {
  const map = new Map();

  for (const route of routes) {
    const key = [normalizeKey(route.commodity), normalizeKey(route.origin), normalizeKey(route.destination)].join("|");

    if (!map.has(key)) map.set(key, { ...route, sources: [] });

    const current = map.get(key);
    current.sources.push({
      source: route.source,
      buyPrice: route.buyPrice,
      sellPrice: route.sellPrice,
      profit: route.profit,
      profitPerMinute: route.profitPerMinute,
      distanceGm: route.distanceGm,
      profitPerGm: route.profitPerGm,
      updatedAt: route.updatedAt
    });

    const routePriority = sourcePriority(route.source);
    const currentPriority = sourcePriority(current.source);
    const shouldReplace = routePriority > currentPriority
      || (routePriority === currentPriority && numeric(route.profitPerMinute) > numeric(current.profitPerMinute))
      || (routePriority === currentPriority && numeric(route.profitPerMinute) === numeric(current.profitPerMinute) && numeric(route.profit) > numeric(current.profit));
    if (shouldReplace) {
      const sources = current.sources;
      map.set(key, { ...route, sources });
    }
  }

  return [...map.values()].map((route) => {
    const profits = route.sources.map((s) => numeric(s.profit)).filter((v) => v > 0);
    const minProfit = profits.length ? Math.min(...profits) : null;
    const maxProfit = profits.length ? Math.max(...profits) : null;
    return {
      ...route,
      sourceCount: new Set(route.sources.map((s) => s.source)).size,
      profitSpreadPct: minProfit && maxProfit && minProfit > 0 ? round2(((maxProfit - minProfit) / minProfit) * 100) : 0
    };
  });
}

function normalizeTransaction(value) {
  const text = clean(value).toUpperCase();
  if (["SELLS", "SELL", "SELLING", "SHOP_SELLS", "SHOP SELLS"].includes(text)) return "SELLS";
  if (["BUYS", "BUY", "BUYING", "SHOP_BUYS", "SHOP BUYS"].includes(text)) return "BUYS";
  return "";
}

function normalizeBoxSizes(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === "string") return value.split(/[^0-9.]+/).map(Number).filter(Number.isFinite);
  return [];
}

function formatShop(tx) {
  const location = clean(tx.location || "");
  const shop = clean(tx.shop || "");
  return [location, shop].filter(Boolean).join(" > ") || "Unknown";
}

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function numberEnv(name, fallback) {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(raw).toLowerCase());
}

function splitEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    if (value === Number.POSITIVE_INFINITY) return value;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function round2OrNull(value) {
  return value === null || value === undefined ? null : round2(value);
}

function floorScu(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n + 1e-9));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? round2(value) : null;
}

function parseDateIso(value) {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

function dateValue(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function maxIso(...values) {
  const dates = values.filter(Boolean).map((v) => new Date(v).getTime()).filter(Number.isFinite);
  if (!dates.length) return null;
  return new Date(Math.max(...dates)).toISOString();
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

function stableId(parts) {
  const input = parts.map((p) => clean(p)).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}
