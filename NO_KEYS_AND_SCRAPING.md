# Без ключей и без scraping

Базовый режим работает без ключей через публичный SC Trade Tools endpoint:

```text
GET https://sc-trade.tools/api/crowdsource/commodity-listings?page=0
```

Token нужен только для защищённых Swagger endpoints, например:

```text
POST https://sc-trade.tools/api/tools/trades
Header: token: <SCTRADE_TOKEN>
```

Проект не парсит HTML. Он работает только через Swagger/OpenAPI endpoints.
