# Acceptance Card — P0-B.3

**Итерация:** P0-B.3 — verifiable methodology for local-SMB operator diagnostic.
**Дата:** 2026-10-28.
**Решение:** **ACCEPT AS VERSIONED METHODOLOGY ONLY**.
**Следующее:** P0-B.4 — подготовить 10–20 независимых вручную размеченных
случаев и критерии оценки. Это **не переход к P0-C** и не заявление,
что найден реальный клиент/исследован реальный сайт.

## Deliverables

- [Версионированный manifest 0.1.0](../../playbooks/operator-local-smb-diagnostic-v0/manifest.json).
- [Методика на русском](../../playbooks/operator-local-smb-diagnostic-v0/PLAYBOOK.md).
- [3 явно синтетических сценария](../../playbooks/operator-local-smb-diagnostic-v0/fixtures/smoke-cases.json).
- [Автоматический contract/method smoke](../../scripts/operator-playbook-selftest.mjs).
- Скрипт включён в общий `npm run check`; текущие runtime API/CLI/MCP/Studio
  и Evidence Report v1 **не менялись**.

## Реальный результат проверок

[GitHub Actions PR check — PASS](https://github.com/conradipui-glitch/yaai/actions/runs/40645978861):
- `npm run check` — PASS; старые и новые тесты совместимы.
- `node scripts/encoding-selftest.mjs` — PASS.
- Сообщение `P0-B.3 methodology smoke + cross-contract: PASS`.
- Никаких платных обращений, регистрации лидов, изменений чужих сайтов,
  входа в сторонние аккаунты и отправки сообщений.

### Три проектных решения на синтетических наблюдениях

| Fixture | Ожидалось | Получено | Evidence trace | Итог |
| --- | --- | --- | --- | --- |
| `actionable` | `propose_draft` | `propose_draft` | `obs-a-cta` → `obs-a-404` | PASS |
| `contested` | `hold_for_review` | `hold_for_review` | `obs-c-serp` → `obs-c-site` | PASS |
| `insufficient` | `insufficient_evidence` | `insufficient_evidence` | Нет оснований для бизнес-специфичного оффера | PASS |

**6 негативных проверок (PASS):** идентификатор другого проекта через
обход пути, ссылка на отсутствующий sourceId, небезопасный URL,
несовпадение временных меток, выдуманное «подтверждение клиента»
из обычной Wordstat-фразы, незаявленный источник другого проекта.
Положительный сценарий проверяется повторно на неизменённом входе
с тем же исходом. Все значения синтетические.

## Quality Gates T0–T7

| Gate | Оценка | Честная граница |
| --- | --- | --- |
| **T0: соответствие цели** | PASS | Manifest/PLAYBOOK задают scope, входы, выходы, версию, источники, запрет авторассылки, 3 исхода |
| **T1: локальная корректность** | PASS для синтетического smoke | Схема, уникальные source/observation IDs, time/region, 3 decision traces + 6 fail-closed примеров |
| **T2: обратная совместимость** | PASS | Существующий `buildPainReportDocument` отклоняет другой source type; полный существующий CI зелёный; контракт Evidence Report v1 не менялся |
| **T3: cross-tool** | PASS на уровне проектного trace; runtime integration NOT RUN (N/A для документационной P0-B.3) | `Source → Observation → prospect audit → offer draft` связан по ID; действующая Pain/Wordstat/SERP семантика описана, но **сквозной процесс ещё не реализован** |
| **T4: воспроизводимость** | PASS для deterministic fixtures; persistence NOT RUN (N/A) | Один и тот же набор даёт тот же статус; ещё не тестировались версия БД/refresh/restore |
| **T5: безопасность и бюджет** | PASS для текущего scope | Только чтение локальных фикстур, запрет cross-case/небезопасных URL и outreach; никаких внешних вызовов |
| **T6: реальный UI** | N/A | Ни пользовательский UI, ни новый endpoint не внедрены; тестировать интерфейс пока нечего |
| **T7: качество решения** | PASS на трёх вручную разобранных синтетических сценариях; независимый benchmark NOT RUN | Качество на реальных проектах и сравнение с baseline — **P0-B.4–5**, не доказано этим PR |

## Согласованность с движком

- `caseId` — по правилам существующего `safeConfigId`.
- `sourceId` и `observationId` — раздельные области; пропавшая
  ссылка отклоняется, не превращается в отчёт.
- SERP — только наблюдённый набор результатов, отсутствие сайта
  в SERP не означает его отсутствия.
- Wordstat — спрос на формулировку, не количество клиентов.
- Evidence Report v1 — прежний `source='yaai-evidence-report'` для
  `pain-discovery`; prospect audit имеет **отдельный будущий контракт**,
  не подменяет существующий отчёт.
- `Jev` — модельная классификация, не доказательство правдивости.
- Studio/MCP — существующие интерфейсы не переписаны; объединённый
  operator result будет реализован и протестирован в P0-C/D/E.

**Известные ограничения:** примеры синтетические; отсутствует независимая
разметка реальных источников; методическая логика в selftest не является
боевым classifier; нет автоматического выполнения, поиска фирм, хранения
prospect audit, HTTP/MCP UI и интеграции с платными API.

## Принятое решение

**P0-B.3 → ACCEPT AS METHODOLOGY ONLY.** Все проверки,
применимые к спецификации, прошли; невыполненные проверки
runtime/workspace/реального качества **открыто перенесены**
в соответствующие P0-B.4/5 и P0-C/D/E, где они станут обязательными.
Стадия P0-B целиком **не принята**.

Следующая итерация — **P0-B.4**, не P0-C.
