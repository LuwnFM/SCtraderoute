# CargoNav — Star Citizen Trade Routes

CargoNav is a static GitHub Pages application for finding profitable Star Citizen cargo routes across Stanton, Pyro and Nyx. It combines community trade data from UEX and SC Trade Tools, calculates route profitability locally in the browser, and keeps a deployable fallback snapshot in the repository.

## What changed from the old SCtraderoute / Poehali draft

- fixed cargo calculation: `min(ship capacity, budget, seller supply, buyer demand)`;
- buy and sell freshness are tracked independently;
- multi-source snapshot (UEX + public SC Trade Tools crowdsource);
- route source badges and source health report;
- system / terminal / commodity / freshness / ROI / profit-per-SCU / container / distance filters;
- selected ship profiles use SCU and container metadata when available;
- Stanton ↔ Pyro ↔ Nyx jump-path display;
- favorites and named filter presets stored locally in the browser;
- multi-stop route mode;
- real UEX price-history request from route details (no fake chart if unavailable);
- scheduled GitHub Actions data refresh + GitHub Pages deploy;
- no Poehali telemetry, inspector scripts, template metadata or external Poehali CDN dependency;
- no framework/runtime dependency: the deployed site is plain HTML/CSS/ES modules.

## Data sources

### UEX API 2.0

The scheduled data builder reads public UEX resources:

- `GET /commodities`
- `GET /terminals`
- `GET /commodities_prices_all`
- `GET /vehicles`
- `GET /jump_points`
- `GET /terminals_distances` for a capped set of high-value route pairs

The browser can optionally request:

- `GET /commodities_prices_history?id_terminal=...&id_commodity=...`

UEX data is community maintained and may differ from current live-server values.

### SC Trade Tools

The builder reads the public paginated crowdsource endpoint:

- `GET /api/crowdsource/commodity-listings?page=N`

The endpoint is intentionally treated as crowdsourced/unfiltered data. The app keeps the source label visible rather than pretending it is authoritative.

Token-protected SC Trade Tools endpoints are not required for the basic deployment.

## Data pipeline

`.github/workflows/pages.yml` runs:

1. checkout;
2. `npm ci`;
3. `npm run build:data`;
4. `npm test`;
5. `npm run build` (static verification);
6. deploy `public/` to GitHub Pages.

The workflow runs on pushes to `main`, manually, and hourly.

If one live source fails, the builder uses the other source plus the last repository snapshot where possible. If all live sources fail and a previous snapshot exists, the existing snapshot is preserved instead of replacing it with empty data.

## Route calculation

For a candidate commodity route:

```text
profitPerScu = destination sell price - origin buy price
budgetUnits = floor(budget / origin buy price)
units = floor(min(ship capacity, budgetUnits, known seller supply, known buyer demand))
profit = units * profitPerScu
ROI = profit / investment * 100
```

Unknown supply/demand is explicitly marked in the UI. The user can require both values to be known.

Freshness filtering checks both market sides. The route's common freshness is the older of the two observations, not the newer one.

## Multi-system routing

Jump-point metadata comes from UEX. The browser builds a shortest system path through the known jump-point graph. A conservative Stanton ↔ Pyro ↔ Nyx fallback exists only for snapshots that lack jump metadata.

Distances are loaded only for a capped set of high-value UEX terminal pairs to avoid issuing thousands of API requests every hour. Routes without a known distance remain usable unless the user enables a maximum-distance filter.

## Multi-stop mode

The multi-stop view chains profitable A → B routes where the next leg begins at the previous destination. Capital is recalculated between legs. The implementation intentionally caps the number of stages and candidate routes so it remains fast in a static browser app.

This is an MVP route-chain optimizer, not a full mixed-cargo linear-programming solver like research projects such as SCOPT.

## Local development

No runtime dependencies are required for the site itself.

```bash
npm ci
npm test
npm run build
python -m http.server 8080 -d public
```

Then open `http://127.0.0.1:8080`.

To refresh live data locally:

```bash
npm run build:data
```

This command requires internet access.

## Environment variables

Optional build-time variables:

```text
UEX_API_BASE=https://api.uexcorp.space/2.0
SCTRADE_API_BASE=https://sc-trade.tools
SCTRADE_CROWD_MAX_PAGES=20
UEX_DISTANCE_PAIRS=80
```

No API secret is required for the default public-source build.

## GitHub Pages

Repository: `LuwnFM/SCtraderoute`

The site is static and uses relative asset paths, so no Vite `base` configuration is required. Set repository **Settings → Pages → Source** to **GitHub Actions** if it is not already selected.

## Persistence

Favorites, presets, the selected ship and filters are stored in browser `localStorage`. No account, backend or database is required.

## Tests

`node --test` covers the critical route logic, including:

- ship capacity limit;
- budget limit;
- seller supply limit;
- buyer demand limit;
- legality filter;
- stale-data filtering;
- distance filtering;
- container compatibility;
- jump-path calculation;
- multi-stop chaining.

## Disclaimer

CargoNav is an unofficial fan-made tool and is not affiliated with Cloud Imperium Games or Roberts Space Industries. Trade data is community maintained. Always verify high-value trades in game before committing large amounts of aUEC.
