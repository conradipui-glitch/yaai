# TOHARO LAB — intent + query action validation

Собрано: 2026-09-15T12:31:18.795Z
Источник: 5035 уникальных Wordstat-строк, 39 seed × 1 региона.
Для количественной сводки учитывается только **Top**: eligible 4476, распределено по intent 3935, без intent 524.
Тип спроса: commercial 113; informational 3889; unmapped 457; noise 17.
Маршрутизация: landing 113; guide 3889; hold 474.

> `maxCount`, `relativeRank` и `relativeDemandBand` — сравнительные сигналы внутри этой выборки. Query type / action — эвристическая маршрутизация контента, а не гарантия SEO-результата. Частотности связанных запросов не суммируются в «объём рынка».

## Россия

| Rank | ID | Приоритет | Intent | Сигнал | Тип спроса | Действие | Max | Сильнейшая фраза | Фраз |
|---:|---|---|---|---|---|---|---:|---|---:|
| 1 | MD03 | P2 | DeepSeek | high | informational | guide | 2406813 | дипсик | 397 |
| 2 | MD09 | P2 | Бесплатные модели | high | informational | guide | 959873 | нейросеть бесплатно | 109 |
| 3 | MD04 | P2 | Gemini | high | informational | guide | 759173 | gemini | 199 |
| 4 | MD05 | P3 | Qwen и китайские модели | high | informational | guide | 345732 | qwen | 357 |
| 5 | TL04 | P2 | OpenAI Codex | high | informational | guide | 113914 | codex | 191 |
| 6 | MD06 | P3 | GLM / Zhipu | high | informational | guide | 83949 | glm | 201 |
| 7 | IN04 | P2 | Генерация изображений | high | informational | guide | 73687 | нейросеть для генерации изображений | 178 |
| 8 | TL01 | P1 | Claude Code | high | informational | guide | 60518 | claude code | 201 |
| 9 | MD07 | P3 | GigaChat | medium | informational | guide | 47230 | gigachat | 196 |
| 10 | IN02 | P2 | API нейросетей и ключи | medium | informational | guide | 33529 | openrouter | 219 |
| 11 | MD08 | P2 | Локальные модели и Ollama | medium | informational | guide | 32951 | ollama | 450 |
| 12 | IN03 | P2 | Автоматизация и боты | medium | informational | guide | 27129 | n8n | 204 |
| 13 | VC01 | P1 | Вайб-кодинг: что это | medium | informational | guide | 13426 | вайб кодинг | 168 |
| 14 | TL05 | P2 | Cursor | medium | informational | guide | 13298 | cursor ai | 190 |
| 15 | AG01 | P1 | Что такое AI-агент | medium | informational | guide | 10110 | ai агент | 351 |
| 16 | MD01 | P1 | Как выбрать модель для кода | medium | informational | guide | 6260 | фото лучшая нейросеть бесплатно онлайн | 83 |
| 17 | VC03 | P2 | Промпты и спецификации | medium | informational | guide | 3624 | промпт инжиниринг | 55 |
| 18 | SC01 | P2 | Безопасность агентов и серверов | medium | informational | guide | 3159 | безопасность нейросети | 1 |
| 19 | AG03 | P1 | Контекст агента | medium | informational | guide | 2605 | контекстное окно | 26 |
| 20 | AG05 | P2 | Мультиагентные системы | medium | informational | guide | 2545 | мультиагентные системы | 26 |
| 21 | MD02 | P1 | Сравнения и бенчмарки моделей | low | informational | guide | 1993 | сравнение нейросетей | 12 |
| 22 | TL07 | P1 | Как выбрать кодинг-агента | low | informational | guide | 1430 | codex vs | 12 |
| 23 | TL03 | P1 | AGENTS.md — файл правил | low | informational | guide | 1365 | agents md | 12 |
| 24 | TL06 | P1 | MCP — протокол и серверы | low | informational | guide | 1209 | mcp сервер что это | 90 |
| 25 | AG04 | P2 | Память агента | low | informational | guide | 860 | память агента | 1 |
| 26 | VC02 | P1 | Первый AI-агент: с чего начать | low | informational | guide | 350 | первый агент ии | 1 |
| 27 | TL02 | P1 | Skills в Claude Code | low | informational | guide | 68 | claude code skills github | 2 |
| 28 | SC02 | P2 | Скам и поддельные нейросети | low | informational | guide | 38 | мошенничество с нейросетью | 1 |
| 29 | IN01 | P2 | VPS и серверы для агентов | low | informational | guide | 37 | локальные нейросети на серверах | 2 |

## Очередь действий по фактическим Top-запросам

| Запрос | Регион | Count | Тип спроса | Действие | Intent | Уверенность |
|---|---|---:|---|---|---|---|
| нейросеть | Россия | 4923526 | unmapped | hold | — | none |
| дипсик | Россия | 2406813 | informational | guide | MD03 DeepSeek | low |
| нейросеть бесплатно | Россия | 959873 | informational | guide | MD09 Бесплатные модели | low |
| нейросеть алиса | Россия | 824764 | unmapped | hold | — | none |
| gemini | Россия | 759173 | informational | guide | MD04 Gemini | low |
| нейросеть фото | Россия | 484372 | unmapped | hold | — | none |
| нейросеть онлайн | Россия | 367667 | unmapped | hold | — | none |
| qwen | Россия | 345732 | informational | guide | MD05 Qwen и китайские модели | low |
| нейросеть ии | Россия | 338609 | unmapped | hold | — | none |
| нейросеть текст | Россия | 285825 | unmapped | hold | — | none |
| нейросеть онлайн бесплатно | Россия | 264927 | unmapped | hold | — | none |
| нейросеть фото бесплатно | Россия | 248331 | unmapped | hold | — | none |
| нейросеть чат | Россия | 242424 | unmapped | hold | — | none |
| нейросеть на русском | Россия | 235607 | unmapped | hold | — | none |
| песни нейросети | Россия | 212053 | unmapped | hold | — | none |
| дипсик нейросеть | Россия | 202348 | informational | guide | MD03 DeepSeek | low |
| нейросеть для генерации | Россия | 189450 | unmapped | hold | — | none |
| нейросеть официальный | Россия | 189238 | unmapped | hold | — | none |
| алиса ии нейросеть | Россия | 186908 | unmapped | hold | — | none |
| нейросеть официальный сайт | Россия | 175968 | unmapped | hold | — | none |
| deepseek | Россия | 171842 | informational | guide | MD03 DeepSeek | low |
| помощь нейросети | Россия | 169150 | unmapped | hold | — | none |
| нейросеть гига | Россия | 145419 | unmapped | hold | — | none |
| гига чат нейросеть | Россия | 142033 | unmapped | hold | — | none |
| нейросеть бесплатно на русском | Россия | 134167 | informational | guide | MD09 Бесплатные модели | low |
| нейросеть картинки | Россия | 125213 | unmapped | hold | — | none |
| без нейросеть | Россия | 122868 | unmapped | hold | — | none |
| гига нейросеть официальный | Россия | 118410 | unmapped | hold | — | none |
| гига чат нейросеть официальный | Россия | 117952 | unmapped | hold | — | none |
| codex | Россия | 113914 | informational | guide | TL04 OpenAI Codex | low |
| чат нейросеть официальный сайт | Россия | 113016 | unmapped | hold | — | none |
| гига сайт нейросеть | Россия | 112947 | unmapped | hold | — | none |
| гига нейросеть официальный сайт | Россия | 112923 | unmapped | hold | — | none |
| гига чат нейросеть сайт | Россия | 112631 | unmapped | hold | — | none |
| гига чат нейросеть официальный сайт | Россия | 112614 | unmapped | hold | — | none |
| нейросеть онлайн фото | Россия | 111809 | unmapped | hold | — | none |
| нейросеть для создания | Россия | 105672 | unmapped | hold | — | none |
| нейросеть текст бесплатно | Россия | 105387 | unmapped | hold | — | none |
| нейросеть порно | Россия | 100540 | noise | hold | — | high |
| нейросеть скачать | Россия | 95903 | unmapped | hold | — | none |
| бесплатная нейросеть без | Россия | 93069 | informational | guide | MD09 Бесплатные модели | low |
| нейросеть регистрация | Россия | 91244 | unmapped | hold | — | none |
| нейросеть без регистрации | Россия | 90433 | unmapped | hold | — | none |
| нейросеть для изображений | Россия | 88407 | unmapped | hold | — | none |
| бесплатная нейросеть регистрация бесплатная | Россия | 86749 | informational | guide | MD09 Бесплатные модели | low |
| нейросеть бесплатно без регистрации | Россия | 86528 | informational | guide | MD09 Бесплатные модели | low |
| нейросеть сгенерировать | Россия | 86042 | unmapped | hold | — | none |
| дипсик на русском | Россия | 85905 | informational | guide | MD03 DeepSeek | low |
| glm | Россия | 83949 | informational | guide | MD06 GLM / Zhipu | low |
| написать нейросеть | Россия | 78410 | unmapped | hold | — | none |
| ии нейросеть бесплатно | Россия | 78206 | informational | guide | MD09 Бесплатные модели | low |
| нейросеть бесплатная помощь | Россия | 75896 | unmapped | hold | — | none |
| нейросеть для презентаций | Россия | 74396 | unmapped | hold | — | none |
| нейросеть для генерации изображений | Россия | 73687 | informational | guide | IN04 Генерация изображений | low |
| дипсик нейросеть на русском | Россия | 72926 | informational | guide | MD03 DeepSeek | low |
| нейросеть оживи | Россия | 69867 | unmapped | hold | — | none |
| оживляющие нейросети | Россия | 69386 | unmapped | hold | — | none |
| песнь нейросеть | Россия | 67785 | unmapped | hold | — | none |
| нейросеть создать песню | Россия | 67257 | unmapped | hold | — | none |
| нейросеть ai | Россия | 66697 | unmapped | hold | — | none |
| нейросеть ай | Россия | 66085 | unmapped | hold | — | none |
| аи нейросеть | Россия | 66074 | unmapped | hold | — | none |
| нейросеть ае | Россия | 66074 | unmapped | hold | — | none |
| оживи фото нейросетью | Россия | 60979 | unmapped | hold | — | none |
| нейросеть оживить фото | Россия | 60752 | unmapped | hold | — | none |
| оживленные фото нейросеть | Россия | 60752 | unmapped | hold | — | none |
| фото ии нейросеть | Россия | 60576 | unmapped | hold | — | none |
| claude code | Россия | 60518 | informational | guide | TL01 Claude Code | low |
| claude coding | Россия | 60518 | unmapped | hold | — | none |
| лучшие нейросети | Россия | 60286 | informational | guide | — | medium |
| gemini google | Россия | 59050 | informational | guide | MD04 Gemini | low |
| нейросеть музыка | Россия | 57253 | unmapped | hold | — | none |
| нейросеть текст онлайн | Россия | 57184 | unmapped | hold | — | none |
| нейросеть для генерации текста | Россия | 56852 | unmapped | hold | — | none |
| нейросеть видео бесплатно | Россия | 56723 | unmapped | hold | — | none |
| создать нейросеть онлайн | Россия | 55081 | unmapped | hold | — | none |
| qwen studio | Россия | 54899 | informational | guide | MD05 Qwen и китайские модели | low |
| алиса ай нейросеть | Россия | 54765 | unmapped | hold | — | none |
| аи нейросеть алиса | Россия | 54762 | unmapped | hold | — | none |
| нейросеть для генерации бесплатно | Россия | 53931 | unmapped | hold | — | none |

## Top-запросы без intent для улучшения preset

| Запрос | Регион | Count | Тип спроса | Действие | Seed |
|---|---|---:|---|---|---|
| нейросеть | Россия | 4923526 | unmapped | hold | бесплатные нейросети, нейросети, нейросеть для программирования |
| нейросеть алиса | Россия | 824764 | unmapped | hold | нейросети |
| нейросеть фото | Россия | 484372 | unmapped | hold | нейросети |
| нейросеть онлайн | Россия | 367667 | unmapped | hold | нейросети |
| нейросеть ии | Россия | 338609 | unmapped | hold | нейросети |
| нейросеть текст | Россия | 285825 | unmapped | hold | нейросети |
| нейросеть онлайн бесплатно | Россия | 264927 | unmapped | hold | бесплатные нейросети, нейросети |
| нейросеть фото бесплатно | Россия | 248331 | unmapped | hold | бесплатные нейросети, нейросети |
| нейросеть чат | Россия | 242424 | unmapped | hold | api нейросети, нейросети |
| нейросеть на русском | Россия | 235607 | unmapped | hold | нейросети |
| песни нейросети | Россия | 212053 | unmapped | hold | нейросети |
| нейросеть для генерации | Россия | 189450 | unmapped | hold | нейросети |
| нейросеть официальный | Россия | 189238 | unmapped | hold | нейросети |
| алиса ии нейросеть | Россия | 186908 | unmapped | hold | нейросети |
| нейросеть официальный сайт | Россия | 175968 | unmapped | hold | нейросети |
| помощь нейросети | Россия | 169150 | unmapped | hold | нейросети |
| нейросеть гига | Россия | 145419 | unmapped | hold | нейросети |
| гига чат нейросеть | Россия | 142033 | unmapped | hold | нейросети, телеграм бот нейросеть |
| нейросеть картинки | Россия | 125213 | unmapped | hold | нейросети |
| без нейросеть | Россия | 122868 | unmapped | hold | нейросети |
| гига нейросеть официальный | Россия | 118410 | unmapped | hold | нейросети |
| гига чат нейросеть официальный | Россия | 117952 | unmapped | hold | нейросети, телеграм бот нейросеть |
| чат нейросеть официальный сайт | Россия | 113016 | unmapped | hold | нейросети |
| гига сайт нейросеть | Россия | 112947 | unmapped | hold | нейросети |
| гига нейросеть официальный сайт | Россия | 112923 | unmapped | hold | нейросети |
| гига чат нейросеть сайт | Россия | 112631 | unmapped | hold | нейросети |
| гига чат нейросеть официальный сайт | Россия | 112614 | unmapped | hold | нейросети |
| нейросеть онлайн фото | Россия | 111809 | unmapped | hold | нейросети |
| нейросеть для создания | Россия | 105672 | unmapped | hold | нейросети |
| нейросеть текст бесплатно | Россия | 105387 | unmapped | hold | бесплатные нейросети, нейросети |
| нейросеть скачать | Россия | 95903 | unmapped | hold | нейросети |
| нейросеть регистрация | Россия | 91244 | unmapped | hold | нейросети |
| нейросеть без регистрации | Россия | 90433 | unmapped | hold | нейросети |
| нейросеть для изображений | Россия | 88407 | unmapped | hold | нейросети |
| нейросеть сгенерировать | Россия | 86042 | unmapped | hold | нейросети |
| написать нейросеть | Россия | 78410 | unmapped | hold | нейросети |
| нейросеть бесплатная помощь | Россия | 75896 | unmapped | hold | бесплатные нейросети, нейросети |
| нейросеть для презентаций | Россия | 74396 | unmapped | hold | нейросети |
| нейросеть оживи | Россия | 69867 | unmapped | hold | нейросети |
| оживляющие нейросети | Россия | 69386 | unmapped | hold | нейросети |
