# Яндекс Вебмастер: запрос → URL → показы и клики

`yaai` собирает Wordstat через Yandex Cloud Search API (`YANDEX_API_KEY` + `YANDEX_FOLDER_ID`). Это API частотности, **не** статистика конкретного сайта. Новый модуль `webmaster` обращается непосредственно к [API Яндекс Вебмастера](https://yandex.ru/dev/webmaster/doc/ru/reference/enhanced-export): он требует OAuth-токен с доступом к подтверждённому сайту. Ключ Yandex Cloud / AI Studio и положительный баланс облака сами по себе не дают такой OAuth-доступ и не оплачивают расширенный тариф Вебмастера.

Для модуля читаются `YANDEX_WEBMASTER_OAUTH_TOKEN` (предпочтительно), `YANDEX_WEBMASTER_TOKEN` или `YANDEX_OAUTH_TOKEN`. Токены не передаются в CLI-аргументах, не выводятся в логах и не хранятся в репозитории. Существующие секреты Wordstat не меняются. Имя секрета в GitHub должно соответствовать одному из этих переменных окружения; наличие/значение секретов нельзя заключить только по исходникам.

## Использование

Пример адреса — только пример; указывайте свой подтверждённый сайт в Вебмастере и фактические пути страниц от корня хоста (для GitHub Pages проекта обычно с префиксом репозитория, например `/silalesa/`).

```bash
npm run webmaster -- probe --site https://example.ru/
npm run webmaster -- start --site https://example.ru/ --dates 2026-09-01,2026-09-02 --paths /page-a/,/page-b/ --execute
npm run webmaster -- status --site https://example.ru/ --task 2f1c5d3b-7d9b-4c3e-8a14-9d8b924a12ef
npm run webmaster -- download --site https://example.ru/ --task 2f1c5d3b-7d9b-4c3e-8a14-9d8b924a12ef --out /private/site-queries.csv
npm run webmaster:overlap -- --input /private/site-queries.csv --out /private/overlap-report.json --min-impressions 2
```

`probe` только читает пользователя, список подтверждённых сайтов, тарифные лимиты и даты. `start` создаёт задачу лишь с `--execute`. По умолчанию `use_pro_tariff=false` (базовый лимит); для расходования расширенного лимита укажите *оба* флага `--use-pro-tariff --allow-paid` и предварительно проверьте тариф. API ограничивает сумму числа дат и URL в одной задаче сотней. Расход определяется произведением числа URL на число дней, доступность дат проверяется до POST. Запрос с расширенным тарифом может потребовать отдельной оплаченной подписки на выгрузку Вебмастера, даже при положительном балансе Yandex Cloud.

`start` возвращает `task_id` и сведения о потраченном/оставшемся лимите. Отчёт формируется асинхронно (обычно десятки минут или часы). `status` проверяет готовность, `download` загружает только HTTPS-ссылки `storage.mds.yandex.net` в новый приватный файл (перезаписи нет). CSV и JSON-результат анализа должны оставаться вне публичного репозитория. Анализ понимает столбцы «URL», «Запрос», «Клики», «Показы», «Позиция», а также английские синонимы; объединяет записи по нормализованной паре запрос/URL и выдаёт пересечения. Одновременные показы двух URL **не доказывают** вредную SEO-каннибализацию: нужна оценка намерения, CTR, динамики и доступной статистики.

## GitHub Actions

Ручной workflow `Webmaster analytics` позволяет выполнить `probe`, инициировать выгрузку (`start`) и позднее получить *только число кандидатов* пересечений (`report`), не публикуя сырые поисковые запросы в логах или артефактах публичного репозитория. В `Actions → Webmaster analytics → Run workflow` явно выбираются сайт, даты, пути, режим и платный лимит. Для всех режимов нужен доступный workflow OAuth-secret из перечисленных выше. Если есть только Yandex Cloud API Key, программа сообщит о несовместимом типе авторизации; не нужно публиковать ключ в переписке или коммитах.

Официальная документация: [API экспорта](https://yandex.ru/dev/webmaster/doc/ru/reference/initialization-export), [лимиты](https://yandex.ru/dev/webmaster/doc/ru/reference/domain-limits), [статус отчёта](https://yandex.ru/dev/webmaster/doc/ru/reference/status-retrieval).
