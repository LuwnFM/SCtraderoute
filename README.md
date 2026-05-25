# Star Citizen Trade Routes — SC Trade Tools only + GitHub Pages

Готовый статический сайт для GitHub Pages. В этом релизе удалён весь старый внешний API-код. Сборка использует только официальный SC Trade Tools Swagger/OpenAPI:

- Swagger UI: `https://sc-trade.tools/swagger-ui/index.html`
- OpenAPI JSON: `https://sc-trade.tools/v3/api-docs`
- публичный источник без токена: `GET /api/crowdsource/commodity-listings`
- опциональный источник с токеном: `POST /api/tools/trades`

Сайт не использует сервер, базу данных и внешние API кроме `sc-trade.tools`. GitHub Actions раз в час собирает `public/data/routes.json` и деплоит папку `public` в GitHub Pages.

## Что внутри

```text
.github/workflows/pages.yml   # GitHub Pages build/deploy
scripts/build-data.mjs        # загрузка данных только с SC Trade Tools API
public/index.html             # статический интерфейс
public/app.js                 # фильтры, сортировка, CSV-импорт
public/styles.css             # стили
public/data/routes.json       # генерируется при сборке
```

## Как работает сборка

1. Если задан `SCTRADE_TOKEN`, скрипт вызывает `POST /api/tools/trades` и берёт готовые маршруты SC Trade Tools.
2. Даже без токена скрипт вызывает публичный `GET /api/crowdsource/commodity-listings?page=N`, собирает свежие `SELLS` и `BUYS` листинги и считает buy → sell маршруты локально.
3. Нереалистичные выбросы отсекаются параметрами `MAX_ROUTE_ROI_PCT`, `MAX_SELL_BUY_RATIO`, `MAX_PROFIT_PER_SCU`.
4. Результат записывается в `public/data/routes.json`.
5. GitHub Pages публикует папку `public`.

## Быстрый старт в Codespaces с телефона

1. Создай новый пустой репозиторий на GitHub.
2. Открой его в Codespaces.
3. Загрузи этот ZIP в файловую панель Codespaces.
4. В терминале выполни команды из раздела ниже.

## Команды для терминала Codespaces

Замени имя ZIP, если GitHub загрузил его под другим названием:

```bash
cd /workspaces
ls -lah
```

Если ZIP лежит в корне текущего Codespace:

```bash
cd /workspaces/$(basename "$PWD")
```

Полная автоматическая распаковка и публикация в текущий репозиторий:

```bash
set -e

ZIP_FILE="sc-trade-routes-pages-sc-only-release.zip"
PROJECT_DIR="sc-trade-routes-pages-v5"

# 1) Найти ZIP, если имя отличается
if [ ! -f "$ZIP_FILE" ]; then
  ZIP_FILE=$(ls -1 *.zip | head -n 1)
fi

echo "Using ZIP: $ZIP_FILE"

# 2) Распаковать во временную папку
rm -rf /tmp/sc-trade-pages-import
mkdir -p /tmp/sc-trade-pages-import
unzip -o "$ZIP_FILE" -d /tmp/sc-trade-pages-import

# 3) Найти папку проекта внутри ZIP
SRC_DIR=$(find /tmp/sc-trade-pages-import -maxdepth 2 -type f -name package.json -exec dirname {} \; | head -n 1)
if [ -z "$SRC_DIR" ]; then
  echo "package.json not found in ZIP"
  exit 1
fi

echo "Source dir: $SRC_DIR"

# 4) Скопировать файлы в текущий репозиторий
rsync -av --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*.zip' \
  "$SRC_DIR"/ ./

# 5) Проверить, что старые внешние API полностью удалены
if grep -RniE '[Uu][Ee][Xx]|api\.[Uu][Ee][Xx]|[Uu][Ee][Xx]corp' . --exclude-dir=.git; then
  echo "Found forbidden external API references"
  exit 1
fi

# 6) Локальная тестовая сборка
node --version
npm run build:data

# 7) Первый коммит и push
git status
git add .
git commit -m "Release SC Trade Tools only GitHub Pages build"
git branch -M main
git push -u origin main
```

После push зайди в **Settings → Pages** и выбери **Build and deployment → Source: GitHub Actions**. Потом открой **Actions → Build and deploy GitHub Pages → Run workflow**.

## Настройки GitHub Secrets и Variables

### Secret

`SCTRADE_TOKEN` — опционально. Нужен только для token-protected Swagger endpoints, например `POST /api/tools/trades`. Без него сборка всё равно работает через публичный crowdsource endpoint.

### Variables

Основные:

```text
SHIP_SCU=128
INVESTMENT_AUEC=1000000
TOP_N=300
MIN_INVENTORY_SCU=1
MAX_ROUTE_ROI_PCT=300
MAX_SELL_BUY_RATIO=4
MAX_PROFIT_PER_SCU=0
ALLOW_EMPTY_ROUTES=false
```

SC Trade Tools tool routes:

```text
SCTRADE_USE_TOOL_ROUTES=true
SCTRADE_SHIP=Freelancer
SCTRADE_PROFIT_TYPE=time
SCTRADE_MAX_STOPS=1
SCTRADE_SUPPORTED_BOX_SIZE_SCU=32
SCTRADE_MIN_SECURITY_LEVEL=0
SCTRADE_AVOID_HIDDEN_LOCATIONS=true
SCTRADE_ALLOW_WAIT_TIMES=false
SCTRADE_USE_AUTO_LOADING=false
SCTRADE_SMART_FILTERS=true
```

Фильтры, если нужно ограничить сборку:

```text
SCTRADE_ORIGIN=
SCTRADE_LOCATION_NAMES=
SCTRADE_LOCATION_NAMES_TYPE=blacklist
SCTRADE_LOCATION_TYPES=
SCTRADE_LOCATION_TYPES_TYPE=blacklist
SCTRADE_FACTION_NAMES=
SCTRADE_FACTION_NAMES_TYPE=blacklist
SCTRADE_COMMODITY_NAMES=
SCTRADE_COMMODITY_NAMES_TYPE=blacklist
SCTRADE_COMMODITY_TYPES=
SCTRADE_COMMODITY_TYPES_TYPE=blacklist
```

Crowdsource:

```text
SCTRADE_USE_CROWDSOURCE=true
SCTRADE_CROWD_MAX_PAGES=20
SCTRADE_CROWD_MAX_AGE_DAYS=21
SCTRADE_CROWD_MIN_QUANTITY_SCU=1
SCTRADE_CROWD_REQUIRE_BOX_COMPAT=false
```

## Локальный запуск

```bash
npm run build:data
npm run serve
```

Открой `http://127.0.0.1:8080`.

## Важно

- В проекте нет старого внешнего API-кода, старых API secrets, старых API variables и старых API ссылок.
- `/api/tools/trades` требует `SCTRADE_TOKEN`.
- `/api/crowdsource/commodity-listings` публичный, но данные unfiltered/cached, поэтому дорогие маршруты лучше проверять в игре.
- Если workflow падает с `No routes were generated`, проверь сетевой доступ к SC Trade Tools, слишком строгие фильтры и `SCTRADE_TOKEN` для protected endpoints. Для временного пустого деплоя можно поставить `ALLOW_EMPTY_ROUTES=true`.
- CSV-импорт остаётся только локальным: выбранный файл читается браузером и никуда не отправляется.
