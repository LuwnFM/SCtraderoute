const state = {
  data: null,
  routes: [],
  localRoutes: [],
  localCsvInfo: null
};

const els = {
  shipScu: document.querySelector("#shipScu"),
  investment: document.querySelector("#investment"),
  sourceFilter: document.querySelector("#sourceFilter"),
  sortBy: document.querySelector("#sortBy"),
  commoditySearch: document.querySelector("#commoditySearch"),
  locationSearch: document.querySelector("#locationSearch"),
  routesBody: document.querySelector("#routesBody"),
  routeCount: document.querySelector("#routeCount"),
  generatedAt: document.querySelector("#generatedAt"),
  sources: document.querySelector("#sources"),
  status: document.querySelector("#status"),
  sourceReports: document.querySelector("#sourceReports"),
  refreshBtn: document.querySelector("#refreshBtn"),
  csvInput: document.querySelector("#csvInput"),
  clearCsvBtn: document.querySelector("#clearCsvBtn"),
  localCsvInfo: document.querySelector("#localCsvInfo")
};

for (const el of [
  els.shipScu,
  els.investment,
  els.sourceFilter,
  els.sortBy,
  els.commoditySearch,
  els.locationSearch
]) {
  el.addEventListener("input", render);
}

els.refreshBtn.addEventListener("click", () => loadData(true));
els.csvInput.addEventListener("change", handleCsvUpload);
els.clearCsvBtn.addEventListener("click", clearLocalCsv);

loadData();
setInterval(() => loadData(false), 5 * 60 * 1000);

async function loadData(manual = false) {
  try {
    setStatus(manual ? "обновляю…" : "загрузка…");
    const res = await fetch(`./data/routes.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    state.routes = Array.isArray(state.data.routes) ? state.data.routes : [];
    syncSourceFilter();
    renderMeta();
    render();
    setStatus("ok");
  } catch (error) {
    console.error(error);
    setStatus(`ошибка: ${error.message}`);
    els.routesBody.innerHTML = `<tr><td colspan="10">Не удалось загрузить data/routes.json: ${escapeHtml(error.message)}</td></tr>`;
  }
}

function syncSourceFilter() {
  const current = els.sourceFilter.value;
  const sources = new Set();

  for (const route of [...state.routes, ...state.localRoutes]) {
    for (const src of route.sources || [{ source: route.source }]) {
      if (src.source) sources.add(src.source);
    }
  }

  els.sourceFilter.innerHTML = `<option value="">Все</option>` +
    [...sources].sort().map((source) => `<option value="${escapeAttr(source)}">${escapeHtml(source)}</option>`).join("");

  if ([...sources].includes(current)) {
    els.sourceFilter.value = current;
  }
}

function renderMeta() {
  const meta = state.data?.meta || {};
  const generatedAt = meta.generatedAt ? new Date(meta.generatedAt) : null;
  els.generatedAt.textContent = generatedAt ? generatedAt.toLocaleString("ru-RU") : "—";

  const okSources = (meta.sourceReports || []).filter((r) => r.ok).map((r) => r.name);
  if (state.localRoutes.length) okSources.push("Local CSV / Companion");
  els.sources.textContent = okSources.length ? okSources.join(", ") : "—";
  renderLocalCsvInfo();

  els.sourceReports.innerHTML = (meta.sourceReports || []).map((report) => {
    const cls = report.ok ? "good" : "warn";
    return `<li><strong class="${cls}">${escapeHtml(report.name)}:</strong> ${escapeHtml(report.note || "")}</li>`;
  }).join("");
}

function render() {
  const shipScu = floorScu(numberFromInput(els.shipScu, state.data?.meta?.params?.shipScu ?? 128));
  const investment = Math.floor(numberFromInput(els.investment, state.data?.meta?.params?.investment ?? 1_000_000));
  const source = els.sourceFilter.value;
  const commodityNeedle = els.commoditySearch.value.trim().toLowerCase();
  const locationNeedle = els.locationSearch.value.trim().toLowerCase();
  const sortBy = els.sortBy.value;

  let rows = [...state.routes, ...state.localRoutes].map((route) => recalcRoute(route, shipScu, investment));

  if (source) {
    rows = rows.filter((r) => (r.sources || []).some((s) => s.source === source) || r.source === source);
  }

  if (commodityNeedle) {
    rows = rows.filter((r) => String(r.commodity || "").toLowerCase().includes(commodityNeedle));
  }

  if (locationNeedle) {
    rows = rows.filter((r) => {
      const haystack = `${r.origin || ""} ${r.destination || ""}`.toLowerCase();
      return haystack.includes(locationNeedle);
    });
  }

  rows.sort((a, b) => {
    if (sortBy === "updatedAt") {
      return dateValue(b.updatedAt) - dateValue(a.updatedAt);
    }
    return numeric(b[sortBy]) - numeric(a[sortBy]);
  });

  els.routeCount.textContent = rows.length.toLocaleString("ru-RU");

  const visible = rows.slice(0, 200);
  els.routesBody.innerHTML = visible.length
    ? visible.map(routeRowHtml).join("")
    : `<tr><td colspan="10">Маршруты не найдены под текущие фильтры.</td></tr>`;
}

function recalcRoute(route, shipScu, investment) {
  // SC Trade Tools crowdsource rows have profitPerScu and caps, so recalculate for user-entered SCU/budget.
    const shipScuVal = floorScu(shipScu);
    const investmentVal = Math.floor(Number(investment) || 0);
    const buyPrice = numeric(route.buyPrice);
    const sellPrice = numeric(route.sellPrice);
    const profitPerScu = numeric(route.profitPerScu) || (sellPrice > buyPrice ? sellPrice - buyPrice : 0);

    // Never allow fractional cargo in the UI.
    const routeLoad = floorScu(route.loadScu);
    const maxByInvestment = buyPrice > 0 && investmentVal > 0 ? floorScu(investmentVal / buyPrice) : shipScuVal;
    const maxSupply = wholeScuOr(route.maxSupplyScu, routeLoad || shipScuVal);
    const maxDemand = wholeScuOr(route.maxDemandScu, routeLoad || shipScuVal);

    const loadScu = floorScu(Math.max(0, Math.min(shipScuVal, maxByInvestment, maxSupply, maxDemand)));
    const investmentRequired = buyPrice > 0 ? loadScu * buyPrice : numeric(route.investmentRequired);
    const profit = profitPerScu > 0 ? loadScu * profitPerScu : numeric(route.profit);
    const distanceGm = numeric(route.distanceGm);

    return {
      ...route,
      loadScu,
      investmentRequired,
      profit,
      roiPct: investmentRequired > 0 ? (profit / investmentRequired) * 100 : numeric(route.roiPct),
      profitPerGm: distanceGm > 0 ? profit / distanceGm : route.profitPerGm
    };
}

function routeRowHtml(route) {
  const sourceBadges = (route.sources || [{ source: route.source }])
    .map((s) => `<span class="badge">${escapeHtml(s.source || "source")}</span>`)
    .join("");

  const spread = route.profitSpreadPct > 0
    ? `<span class="badge warn">spread ${formatPct(route.profitSpreadPct)}</span>`
    : "";

  const ppm = route.profitPerMinute
    ? `<span class="badge">${formatMoney(route.profitPerMinute)}/мин</span>`
    : "";

  const routeLink = "";

  return `
    <tr>
      <td><strong>${escapeHtml(route.commodity)}</strong>${spread}${ppm}${routeLink}</td>
      <td>${escapeHtml(route.origin)}</td>
      <td>${escapeHtml(route.destination)}</td>
      <td>${formatScu(route.loadScu)}</td>
      <td>${formatMoney(route.buyPrice)} → ${formatMoney(route.sellPrice)}<br><span class="muted">+${formatMoney(route.profitPerScu)}/SCU</span></td>
      <td><strong class="good">${formatMoney(route.profit)}</strong><span class="muted">инвест: ${formatMoney(route.investmentRequired)}</span></td>
      <td>${formatPct(route.roiPct)}</td>
      <td>${formatDistance(route)}</td>
      <td>${sourceBadges}</td>
      <td>${route.updatedAt ? escapeHtml(new Date(route.updatedAt).toLocaleDateString("ru-RU")) : "—"}</td>
    </tr>
  `;
}

function formatDistance(route) {
  if (!route.distanceGm) return "—";
  const perGm = route.profitPerGm ? `<br><span class="muted">${formatMoney(route.profitPerGm)}/GM</span>` : "";
  return `${formatNumber(route.distanceGm)} GM${perGm}`;
}

function numberFromInput(input, fallback) {
  const n = Number(input.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function setStatus(text) {
  els.status.textContent = text;
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function dateValue(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}


async function handleCsvUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setStatus("читаю CSV…");
    const text = await file.text();
    const rows = parseCsv(text);
    const listings = rows.map(normalizeCsvListing).filter(Boolean);
    const routes = calculateLocalCsvRoutes(listings);
    state.localRoutes = routes;
    state.localCsvInfo = {
      fileName: file.name,
      rows: rows.length,
      listings: listings.length,
      routes: routes.length
    };
    syncSourceFilter();
    renderMeta();
    render();
    setStatus("ok");
  } catch (error) {
    console.error(error);
    state.localRoutes = [];
    state.localCsvInfo = { error: error.message };
    renderLocalCsvInfo();
    setStatus(`ошибка CSV: ${error.message}`);
  }
}

function clearLocalCsv() {
  state.localRoutes = [];
  state.localCsvInfo = null;
  els.csvInput.value = "";
  syncSourceFilter();
  renderMeta();
  render();
}

function renderLocalCsvInfo() {
  if (!els.localCsvInfo) return;
  const info = state.localCsvInfo;
  if (!info) {
    els.localCsvInfo.textContent = "CSV не загружен";
    return;
  }
  if (info.error) {
    els.localCsvInfo.textContent = `CSV ошибка: ${info.error}`;
    return;
  }
  els.localCsvInfo.textContent = `${info.fileName}: строк ${info.rows}, листингов ${info.listings}, маршрутов ${info.routes}`;
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  if (!nonEmpty.length) return [];

  const headers = nonEmpty[0].map((h) => normalizeHeader(h));
  return nonEmpty.slice(1).map((values) => {
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = values[idx] ?? "";
    });
    return obj;
  });
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function normalizeCsvListing(row) {
  const locationRaw = pick(row, ["location", "shop", "locationandshop", "terminal", "terminalname", "place"]);
  const extraShop = pick(row, ["shopname", "store", "kiosk"]);
  const location = [locationRaw, extraShop].filter(Boolean).join(" > ") || locationRaw;
  const commodity = pick(row, ["commodity", "item", "itemname", "commodityname", "product"]);
  const transaction = normalizeTransaction(pick(row, ["transaction", "action", "side", "type", "tab"]));
  const price = numberValue(pick(row, ["price", "priceperscu", "priceperunit", "unitprice", "priceauec"]));
  const quantity = numberValue(pick(row, ["quantity", "quantityinscu", "maxquantityinscu", "available", "inventory", "supply", "demand"]));
  const timestamp = parseDate(pick(row, ["timestamp", "updatedat", "date", "createdat", "time"]));
  const boxSizes = parseBoxSizes(pick(row, ["boxsizesinscu", "boxsizes", "boxsizescu"]));

  if (!location || !commodity || !transaction || !(price > 0)) return null;

  return {
    location,
    commodity,
    transaction,
    price,
    quantity: quantity > 0 ? quantity : Number.POSITIVE_INFINITY,
    timestamp,
    boxSizes
  };
}

function calculateLocalCsvRoutes(listings) {
  const shipScu = floorScu(numberFromInput(els.shipScu, state.data?.meta?.params?.shipScu ?? 128));
  const investment = Math.floor(numberFromInput(els.investment, state.data?.meta?.params?.investment ?? 1_000_000));
  const byCommodity = new Map();

  for (const listing of latestListings(listings)) {
    const key = normalizeKey(listing.commodity);
    if (!byCommodity.has(key)) byCommodity.set(key, { commodity: listing.commodity, origins: [], destinations: [] });
    const bucket = byCommodity.get(key);
    if (listing.transaction === "SELLS") bucket.origins.push(listing);
    if (listing.transaction === "BUYS") bucket.destinations.push(listing);
  }

  const routes = [];
  for (const bucket of byCommodity.values()) {
    const origins = bucket.origins.sort((a, b) => a.price - b.price).slice(0, 80);
    const destinations = bucket.destinations.sort((a, b) => b.price - a.price).slice(0, 80);
    for (const origin of origins) {
      for (const destination of destinations) {
        if (normalizeKey(origin.location) === normalizeKey(destination.location)) continue;
        const profitPerScu = destination.price - origin.price;
        if (profitPerScu <= 0) continue;
        const maxByInvestment = investment > 0 ? investment / origin.price : shipScu;
        const loadScu = floorScu(Math.max(0, Math.min(shipScu, origin.quantity, destination.quantity, maxByInvestment)));
        if (loadScu <= 0) continue;
        const investmentRequired = loadScu * origin.price;
        const profit = loadScu * profitPerScu;

        routes.push({
          id: stableId(["local-csv", bucket.commodity, origin.location, destination.location, origin.price, destination.price]),
          source: "Local CSV / Companion",
          commodity: bucket.commodity,
          origin: origin.location,
          destination: destination.location,
          buyPrice: origin.price,
          sellPrice: destination.price,
          profitPerScu,
          loadScu,
          maxSupplyScu: Number.isFinite(origin.quantity) ? origin.quantity : null,
          maxDemandScu: Number.isFinite(destination.quantity) ? destination.quantity : null,
          investmentRequired,
          profit,
          roiPct: investmentRequired > 0 ? (profit / investmentRequired) * 100 : null,
          profitPerMinute: null,
          timeInSeconds: null,
          distanceGm: null,
          profitPerGm: null,
          quality: null,
          updatedAt: maxIso(origin.timestamp, destination.timestamp),
          notes: ["Calculated locally from uploaded CSV; file is not uploaded anywhere"],
          sources: [{ source: "Local CSV / Companion", buyPrice: origin.price, sellPrice: destination.price, profit, updatedAt: maxIso(origin.timestamp, destination.timestamp) }]
        });
      }
    }
  }

  return routes.sort((a, b) => b.profit - a.profit).slice(0, 1000);
}

function latestListings(listings) {
  const map = new Map();
  for (const listing of listings) {
    const key = [normalizeKey(listing.commodity), normalizeKey(listing.location), listing.transaction].join("|");
    const prev = map.get(key);
    if (!prev || dateValue(listing.timestamp) >= dateValue(prev.timestamp)) map.set(key, listing);
  }
  return [...map.values()];
}

function pick(row, names) {
  for (const name of names) {
    const value = row[normalizeHeader(name)];
    if (String(value ?? "").trim() !== "") return String(value).trim();
  }
  return "";
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

function normalizeTransaction(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (["SELLS", "SELL", "SELLING", "SHOPSELLS", "SHOP SELLS", "BUY TAB", "BUY"].includes(text)) return "SELLS";
  if (["BUYS", "BUYING", "SHOPBUYS", "SHOP BUYS", "SELL TAB", "SELL"].includes(text)) return "BUYS";
  return "";
}

function numberValue(value) {
  const clean = String(value ?? "").replace(/[^0-9.,-]+/g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function parseBoxSizes(value) {
  return String(value ?? "").split(/[^0-9.]+/).map(Number).filter(Number.isFinite);
}

function parseDate(value) {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

function maxIso(...values) {
  const dates = values.filter(Boolean).map((v) => new Date(v).getTime()).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}

function stableId(parts) {
  const input = parts.map((p) => String(p ?? "").trim()).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

function formatScu(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return floorScu(value).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function floorScu(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n + 1e-9));
}

function wholeScu(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n + 1e-9));
}

function wholeScuOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? wholeScu(n) : wholeScu(fallback);
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " aUEC";
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + "%";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
