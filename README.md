# CargoNav

CargoNav — статический React/Vite-планировщик торговых маршрутов Star Citizen для Stanton, Pyro и Nyx. Данные агрегируются из UEX и SC Trade Tools и обновляются GitHub Actions.

## Локальный запуск

```bash
npm install
npm run build:data
npm run dev
```

## Проверки

```bash
npm test
npm run typecheck
npm run build
```

## GitHub Pages

`main` автоматически собирается и разворачивается GitHub Actions. Vite настроен на project-page base `/SCtraderoute/`. Торговый snapshot обновляется по расписанию и при production deploy.

## Данные и ограничения

- UEX: цены, терминалы, корабли, часть расстояний и история цен.
- SC Trade Tools: дополнительный источник торговых данных.
- Supply и demand учитываются при расчёте объёма груза.
- Возраст buy/sell цен показывается раздельно; общая свежесть маршрута определяется более старой стороной.
- Межсистемные пути учитывают jump points Stanton ↔ Pyro ↔ Nyx.
- Это community-инструмент; данные не являются официальными данными CIG и могут отличаться от live-сервера.

## Архитектура

- `src/` — React UI на исходной Poehali/Tailwind design system.
- `src/lib/routes.ts` — клиентская торговая логика.
- `scripts/build-data.mjs` — агрегация внешних API в `public/data/trade-snapshot.json`.
- `public/lib/trade-core.js` — независимое ядро, используемое pipeline/tests.
- `tests/` — regression tests критической торговой логики.

Poehali preview telemetry/inspector scripts для production не требуются и в проект не включены.
