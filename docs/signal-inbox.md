# Local signal inbox — Stage 3B (before remote VPS testing)

YA AI now has a **project-scoped, local-only signal inbox** based on
**already persisted task events**. It is the basis for later Telegram
notifications, Web Studio alerts and campaign-monitoring rules, but none
of these delivery systems or live ad watchers are implemented here.

## What creates a signal

No new background worker is necessary: signals are deterministically
derived from events already saved by task execution and saved-report
linking. Reading the inbox **never** calls a model or external API.

| Signal | Severity | Meaning |
| --- | --- | --- |
| `run_failed` | warning | A local offline Webmaster task attempt recorded a failure |
| `run_interrupted` | warning | An attempt started but never recorded its result |
| `run_succeeded` | info | A local offline Webmaster task attempt completed and passed integrity checks |
| `artifact_linked` | info | A **previously saved** JSON result was linked to a draft; YA AI did not run the source operation |

The inbox does not claim ad campaign fraud, budget overruns, delayed
conversion, customer intent or business anomalies. Those signals
require trusted new data sources and separately tested detection rules.

Each signal has a deterministic ID (case + task + type + attempt),
occurrence time and evidence pointer (task ID), but does **not**
copy raw research artifacts or API keys into the signal. Repeated reads,
CLI restarts and an offline polling client see the **same** IDs, not
duplicate notifications.

## CLI example

A private case with registered tasks is required:

~~~bash
npm run signals -- list \
  --workspace /private/client-project \
  --case client-a

npm run signals -- list \
  --workspace /private/client-project \
  --case client-a --unread-only
~~~

Once a human has inspected a signal, explicitly acknowledge it:

~~~bash
npm run signals -- ack \
  --workspace /private/client-project \
  --case client-a \
  --id signal-REPLACE_WITH_REAL_SIGNAL_ID
~~~

An acknowledgement is a **write-once local record** stored under
`tasks/signal-acks/<case-id>/`. It is retained after a restart and
does not modify original task events. A second identical acknowledgement
is idempotent. Wrong case, invalid signal ID and corrupted acknowledgement
records are rejected. Ack means **seen**, not `fixed`, `delivered` or
`user-approved action`. It does not restart a task or change an ad.

The current implementation scans the first 200 tasks from one private
workspace and rejects larger scans rather than quietly dropping signals.
It is deliberately a bounded first-stage inbox, not a high-volume
streaming database or real-time service.

## Read-only MCP and VPS staging interfaces

- The new **read-only** stdio MCP tool `yaai_signals` lists signals
  for one selected case and supports `unreadOnly: true`. A session
  already pinned to a case cannot request another case's signals.
  MCP cannot acknowledge, trigger a task, invoke Jev or publish.
- The existing isolated loopback VPS **read-only** process adds
  `GET /v1/signals` (the same bearer auth as `GET /v1/tasks`).
  Only metadata from the selected case is returned, without full
  task title/description, report text or source evidence. It has no
  HTTP acknowledgement, message sending, campaign write or paid API route.

In both clients, `delivery: "local-only"` and
`notificationSent: false` are intentional: **no Telegram messages
have been delivered**. We are preparing a signal source that future
authorized transports can use without guessing which work actually ran.

## No additional permissions or expenses

- No network/API calls are initiated by inbox read or acknowledgement.
- No new background polling, scheduling or remote MCP write tools.
- No automatic resuming or running offline/paid tasks.
- No advertising changes or AI-generated interpretations.
- All files reside in the existing **private** workspace and are
  included in the previously implemented encrypted workspace backup
  under `tasks/`.

## Acceptance tests

`npm run signals:selftest` and `npm run check` test genuine saved
offline task events, persistent acknowledgment across a fresh process,
failure followed by success, interrupted attempt, duplicate polling,
client-case isolation, tampering refusal and cross-interface
read-only behavior via MCP/VPS. Test fixtures are synthetic; no real
campaign sources or paid APIs were used.

## Next after this step

1. Implement explicit **signal rules** based on actual imported metrics
   (not claimed click-fraud detection), with observable inputs, threshold,
   evidence and human review, beginning in dry-run.
2. Implement a controlled **delivery outbox/Telegram transport** with
   deduplication, backoff and scoped credentials (after deployment review).
3. Continue Web Studio and contextual Knowledge Layer so the same
   signals can be explained and visualized in the interface.

**Remote VPS/TLS testing remains postponed by agreement.**
See [delivery plan](yaai-delivery-plan.md).
