# Amedia Pass Mini App API

Все ответы — JSON. Успешный ответ содержит `data`, ошибка — `error.code` и безопасное пользовательское `error.message`.

## Авторизация

- Telegram: `Authorization: tma <Telegram.WebApp.initData>`.
- Локальная разработка: `Authorization: demo`, только когда сервер запущен с `ALLOW_DEMO_AUTH=true`.

## Маршруты

### `GET /api/health`

Проверка сервера без авторизации. Возвращает активный провайдер: `demo` или `passoffice-open-api`.

### `GET /api/session`

Проверяет Telegram-сессию и возвращает текущего пользователя.

### `POST /api/requests`

Обязательный заголовок: `Idempotency-Key`, один уникальный ключ на одно намерение пользователя создать заявку.

```json
{
  "visitDate": "2026-08-27",
  "room": "БП — 10",
  "organization": "ООО Пример",
  "visitors": [
    {
      "lastName": "Иванов",
      "firstName": "Иван",
      "middleName": "Иванович",
      "birthDate": "1990-01-01",
      "isForeignCitizen": false
    }
  ]
}
```

Первый успешный вызов возвращает `201`; безопасный повтор с тем же ключом и телом — `200` и `meta.replayed: true`. Повтор ключа с другим телом — `422 IDEMPOTENCY_KEY_REUSED`.

Состояния локальной операции:

- `SUBMITTING` — отправка началась;
- `VERIFIED` — внешний идентификатор и статус получены;
- `REJECTED` — PassOffice явно отклонил операцию;
- `UNKNOWN` — соединение оборвалось, итог нельзя считать ни успешным, ни неуспешным без сверки.

### `GET /api/requests?page=1&pageSize=20&status=VERIFIED`

Возвращает только заявки текущего Telegram-пользователя и метаданные пагинации.

### `GET /api/requests/:id`

Возвращает одну заявку текущего Telegram-пользователя.

## Реальный PassOffice

Провайдер `passoffice-open-api` намеренно не делает запросов, пока не получен Swagger конкретной установки. Для включения нужны URL IntegrationServer и API-ключ, выпущенный администратором PassOffice. Это исключает догадки о пути, теле запроса и трактовке статусов.
