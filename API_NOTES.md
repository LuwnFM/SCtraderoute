# API notes: SC Trade Tools only

Этот релиз использует только SC Trade Tools Swagger/OpenAPI.

## База

```text
https://sc-trade.tools
```

## Swagger/OpenAPI

```text
https://sc-trade.tools/swagger-ui/index.html
https://sc-trade.tools/v3/api-docs
```

## Используемые endpoints

| Endpoint | Зачем используется | Токен |
|---|---|---|
| `GET /api/crowdsource/commodity-listings?page=N` | публичные crowdsourced commodity listings; из них скрипт считает buy → sell маршруты | нет |
| `POST /api/tools/trades` | готовые profitable trade routes от SC Trade Tools | да, header `token` |

## Неиспользуемые endpoints

Проект не вызывает старый внешний API и не парсит HTML-страницы. Все данные берутся только из `sc-trade.tools/api/...`.
