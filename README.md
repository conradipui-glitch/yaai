# yaai — reusable market and SEO research engine

`yaai` is a client-neutral engine. Client cases, presets, planner profiles, result files and dated snapshots live in external project workspaces.

The engine provides:

- Yandex Wordstat batch collection;
- Yandex Webmaster query-to-URL exports, average-position rank tracking and overlap analysis (OAuth, independent from Wordstat credentials);
- guarded Yandex Search API SERP collection and competitor/result-page evidence;
- platform-neutral distribution evidence with shared `Entity / ContentItem / MetricsSnapshot` contracts;
- a live YouTube Data API v3 adapter for topic/channel/content research;
- a read-only Telegram MTProto adapter for public channel/post research, repeated counter snapshots and outbound-link evidence;
- a cheap structured Evaluation Layer using TypeSafe Jev through OpenRouter Decisions for lead/content/message classification before expensive AI work;
- YouTube transcript enrichment (.md/.srt/.vtt/.txt or optional public captions) linked to ContentItem and Jev offer/pain/CTA/funnel evidence;
- intent clustering and query classification;
- Commercial / Informational / Noise / Unmapped labels;
- Landing / Guide / Hold recommendations and Page Planner;
- dated snapshots and comparisons between runs;
- a small local web UI;
- a local MCP server for AI agents (workspace overview, analysis, Page Planner, snapshot comparison, Webmaster, SERP and saved distribution evidence);
- reusable Agent Skills for Yandex keyword research, Page Planning, SEO review, content gaps, distribution intelligence and decision reports.

For Webmaster access, export commands, costs, GitHub Actions and private CSV analysis, read **[docs/webmaster.md](docs/webmaster.md)**. The presence of a Yandex Cloud API key or cloud balance does not establish access to Webmaster's OAuth-protected reports or its separate extended tariff.

## Workspace boundary

A workspace is any directory with this structure:

```text
workspace/
  cases/
    <case-id>.json
  presets/
    <result-prefix>.json
  planners/
    <result-prefix>.json
  results/
  snapshots/
    <case-id>/
```

The repository contains only `examples/workspace/`, a neutral fixture used for documentation and self-tests. Real client data must not be committed to the engine repository.

## Selecting a workspace

Use either a CLI flag or an environment variable:

```bash
node server.mjs --workspace ../my-project/research/yaai
YAAI_WORKSPACE=../my-project/research/yaai node server.mjs
```

Batch scripts use the same workspace resolver. A case is selected explicitly:

```bash
node scripts/batch.mjs --workspace ../my-project/research/yaai --case my-project-seo
node scripts/build-page-plan.mjs --workspace ../my-project/research/yaai --case my-project-seo
node scripts/snapshot-results.mjs --workspace ../my-project/research/yaai --case my-project-seo
node scripts/compare-snapshots.mjs --workspace ../my-project/research/yaai --case my-project-seo
```

Equivalent environment variables are `YAAI_WORKSPACE` and `CASE_ID` / `YAAI_CASE_ID`.

For an unusual layout, only the case configuration directory can be overridden separately with `--case-root` or `YAAI_CASE_ROOT`. Presets, planners, results and snapshots continue to resolve from the workspace root.

## Case contract

`cases/<case-id>.json` controls collection and names the result prefix:

```json
{
  "id": "example-seo",
  "name": "Example SEO case",
  "resultPrefix": "example",
  "regions": ["Example Region"],
  "devices": ["DEVICE_ALL"],
  "numPhrases": 100,
  "seeds": ["buy widget", "how to choose widget"]
}
```

The engine then loads:

- `presets/example.json` for intent/query classification;
- `planners/example.json` for page targets and Page Planner settings;
- `results/example-*-latest.*` for current run outputs;
- `snapshots/example-seo/...` for dated history and comparisons.

The result prefix is deliberately independent from the case id so a project can keep stable output filenames while changing case variants.

## Credentials

Wordstat reads Yandex Cloud credentials from the environment:

```text
YANDEX_API_KEY=...
YANDEX_FOLDER_ID=...
```

`YAIS_API` is a supported alias for `YANDEX_API_KEY`; `YAIS_FOLDER_ID` is a supported alias for `YANDEX_FOLDER_ID`. The existing `YAIS_ID` identifies an API key in the legacy loader and smoke test: **it is not automatically a folder ID**. A batch export needs a real folder ID supplied through `YANDEX_FOLDER_ID` or `YAIS_FOLDER_ID`; do not substitute `YAIS_ID` merely because it is configured. The Wordstat smoke test can attempt to discover a missing folder ID, but the batch engine does not rely on that diagnostic heuristic.

Live Yandex Search API SERP collection can use `YANDEX_SEARCH_API_KEY` + `YANDEX_SEARCH_FOLDER_ID`; when these aliases are empty it falls back to `YANDEX_API_KEY` + `YANDEX_FOLDER_ID`. The collector never runs without explicit `--execute`.

Webmaster separately reads `YANDEX_WEBMASTER_OAUTH_TOKEN` (alternatives: `YANDEX_WEBMASTER_TOKEN`, `YANDEX_OAUTH_TOKEN`). A Yandex Cloud API key and key ID cannot replace this user OAuth token.

YouTube distribution research reads `YOUTUBE_API_KEY`. Live collection is explicit and refuses to run without `--execute`:

```bash
npm run youtube:collect -- \\
  --queries "ai sales,lead automation" \\
  --region RU \\
  --language ru \\
  --max-results 10 \\
  --out /private/youtube-evidence.json \\
  --execute
```

The normalized result can then be analyzed locally with `npm run distribution:analyze`.

Telegram research uses `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` from `my.telegram.org` and a local StringSession file:

```bash
npm install
npm run telegram:auth -- --out /private/telegram.session --execute
npm run telegram:collect -- \
  --channels "channel_one,channel_two" \
  --research-queries "AI заработок,автоматизация бизнеса" \
  --limit 50 \
  --session-file /private/telegram.session \
  --out /private/telegram-evidence.json \
  --execute
```

The session file is an active login credential and must never be committed or uploaded. See **[docs/telegram-evidence.md](docs/telegram-evidence.md)** and **[docs/distribution-evidence.md](docs/distribution-evidence.md)**.

Jev evaluation reads the OpenRouter key from `YAIS_AI` (fallback: `OPENROUTER_API_KEY`) and uses pinned model `typesafe/jev-1.13` by default:

```bash
npm run jev:evaluate -- \
  --input /private/items.json \
  --profile examples/evaluation-profiles/lead-qualification.json \
  --out /private/evaluation-results.json \
  --execute

npm run jev:distribution -- \
  --input /private/telegram-evidence.json \
  --profile examples/evaluation-profiles/content-intelligence.json \
  --out /private/content-evaluations.json \
  --execute
```

See **[docs/evaluation-layer.md](docs/evaluation-layer.md)** and **[docs/youtube-transcripts.md](docs/youtube-transcripts.md)**.

Secrets belong in the environment or GitHub Secrets, never in committed client data, scripts, logs or issue threads.

## Pain Quality — проверка на ручной разметке

После Pain Discovery создаём слепую выборку, включая пропущенные Jev кандидаты. Человек размечает исходные свидетельства, а не ответы модели.

```bash
npm run pain:review -- --map /private/pain-map.json --out /private/pain-review.json --sample-size 100
npm run pain:review:interactive -- --review /private/pain-review.json --reviewer analyst
npm run pain:quality -- --map /private/pain-map.json --review /private/pain-review.json --out /private/pain-quality.json --md /private/pain-quality.md
```

Получаем precision, recall, подтверждённость источниками и стоимость Jev на верно найденную боль. Без человеческих меток эти показатели не считаются.
См. [docs/pain-quality.md](docs/pain-quality.md).
## Pain Discovery v1

Find **candidate audience problems** using observed Yandex Wordstat phrases, SERP titles/passages, and cheap Jev classification. This reuses the current Wordstat/Search API connections, not a new external service.

~~~bash
npm run pain:wordstat -- --seeds "автоматизация продаж" --region 225 --out /private/pain-wordstat.json --execute
npm run pain:prepare -- --topic "автоматизация продаж" --wordstat /private/pain-wordstat.json --limit 8 --out /private/query-plan.json --query-file /private/pain-queries.txt
npm run serp:collect -- --query-file /private/pain-queries.txt --region 225 --groups 5 --out /private/pain-serp.json --execute
npm run pain:analyze -- --topic "автоматизация продаж" --wordstat /private/pain-wordstat.json --serp /private/pain-serp.json --out /private/pain-map.json --md /private/pain-map.md --execute
~~~

Pain cards remain explicitly **unverified hypotheses**, with source links and non-additive Wordstat counters. See [docs/pain-discovery.md](docs/pain-discovery.md).

## YouTube transcript → Jev

If you already have one video transcript, **no YouTube API key or full Distribution dataset is needed**:

```bash
npm run youtube:transcripts -- \
  --video "https://www.youtube.com/watch?v=4mkUoy7PM5Q" \
  --transcript-file /private/4mkUoy7PM5Q.md \
  --out /private/transcript-evidence.json
```



```bash
npm run youtube:transcripts -- \
  --distribution /private/youtube-evidence.json \
  --input-dir /private/transcripts \
  --out /private/transcript-evidence.json

npm run transcript:evaluate -- \
  --transcripts /private/transcript-evidence.json \
  --out /private/transcript-evaluation.json \
  --execute
```

Local import supports timestamped Markdown as well as plain text/SRT/VTT. Optionally add `--fetch --execute` to the first command to *attempt* public YouTube captions; data-center blocks are recorded. Jev flags offer, pain, CTA, funnel and monetization candidates in time-linked excerpts, not verified exact text. See **[docs/youtube-transcripts.md](docs/youtube-transcripts.md)**.

## MCP for AI agents

Run the local stdio server against any yaai workspace:

```bash
npm run mcp -- --workspace ../my-project/research/yaai --case my-project-seo
```

The MCP layer is deliberately thin: it reuses yaai's deterministic analysis code and does **not** call live external collection APIs. Fresh Yandex SERP, YouTube, Telegram, or Jev evaluation evidence is produced only through explicit CLI commands that require `--execute`. See **[docs/mcp.md](docs/mcp.md)** for client configuration, tools, protocol compatibility and the safety boundary.

## Agent Skills

The repository includes reusable workflows in `.agents/skills/`:

- `yandex-keyword-research` — grounded demand research from Wordstat;
- `page-plan` — CREATE / EXPAND / MERGE / HOLD decisions;
- `rank-tracker` — Yandex Webmaster average-position movement and striking-distance queries;
- `competitor-evidence` — observed Yandex SERP domains/pages and own-domain gaps;
- `distribution-intelligence` — recurring creators/channels, topic distribution, observed content counters and metric movement from saved platform evidence;
- `cheap-evaluation` — Jev choice/noul/score evidence as a low-cost gate before expensive reasoning or generation;
- `seo-review` — current demand + planner + snapshot + optional Webmaster review;
- `content-gap` — uncovered or weakly mapped first-party demand;
- `seo-report` — concise evidence-labeled decision reporting.

Skills orchestrate the MCP tools; they do not replace yaai's deterministic calculations. See **[docs/agent-skills.md](docs/agent-skills.md)**. Rank tracking is documented in **[docs/rank-tracker.md](docs/rank-tracker.md)**, SERP evidence in **[docs/serp-evidence.md](docs/serp-evidence.md)**, platform/distribution evidence in **[docs/distribution-evidence.md](docs/distribution-evidence.md)**, Telegram collection in **[docs/telegram-evidence.md](docs/telegram-evidence.md)**, and Jev evaluation in **[docs/evaluation-layer.md](docs/evaluation-layer.md)**.

## Local UI

```bash
npm start -- --workspace ../my-project/research/yaai
```

Open `http://127.0.0.1:8787`. Presets and planner profiles are loaded from the selected workspace. There is no built-in client default.

## Validation

```bash
npm run check
```

CI runs syntax checks and neutral end-to-end tests using `examples/workspace/`, along with mock Webmaster API calls and synthetic query-URL CSV. No real client case, OAuth secret or paid export is needed for CI.


## Security and evidence integrity (0.18.1)

The local Wordstat UI requires the same-origin browser request token that it automatically obtains from `GET /api/config` for **every POST**. Other origins, non-JSON requests and missing tokens are rejected before any paid API request. The server only listens on `127.0.0.1`; the Host header must also be loopback.

`YAAI_LOCAL_API_MAX_CALLS` limits actual outgoing Yandex API attempts **per server process**, default 100 (allowed 1–1000). Cached Wordstat hits do not consume this budget. **This is a count cap, not a USD/RUB spending guarantee**, and restarting the process resets it. `/api/config` reports the remaining call allowance.

Unknown Wordstat counts and unknown Jev usage costs are represented as `null`, not fabricated zero. If any Jev request omits cost, `summary.totalCost` is unknown; `measuredCostSubtotal` remains the known partial amount with `missingCostCount`.

Pain Quality distinguishes cost per **human-accepted pain** and cost per **source-supported true positive**. The latter requires the human to mark the original excerpt as supporting the pain.

Checks: `npm run audit:selftest`, `npm run check` (offline; no real Yandex/OpenRouter calls).


### Live API smoke tests are opt-in (0.18.2)

GitHub Actions tests that call Yandex Wordstat, Yandex Search, OpenRouter/Jev, or cached Jev research now use **manual** `workflow_dispatch` only. Merging code no longer silently launches these 10 metered/research workflows. Run them explicitly from GitHub → Actions when you want a live integration check; standard CI still runs automatically on pull requests and main pushes without API credentials. The Wordstat monthly dynamics workflow additionally requires `confirm_live=true`.

Guardrail: `npm run workflow:budget:selftest` fails if any of these workflows regains a `push` trigger. This does not disable other manually triggered workflows, nor guarantee zero charges from workflows added in the future.

## SERP relevance: independent human check

To review filtering mistakes without re-running paid APIs, use the
[48-row stratified SERP review procedure](docs/serp-human-review.md).
It generates unfilled human-label fields and calculates sample-only
false-exclusion indicators **after** real human review, not before.

## Evidence-backed reports

Generate a standalone, searchable HTML report and structured source-backed JSON **offline** from a saved Pain Map:

```bash
npm run report:pain -- --map /private/pain-map.json --html /private/pain-evidence.html
```

The output distinguishes source observations, model hypotheses and (if supplied) provisional human review. It preserves all accepted/rejected evidence, checks integrity and never calls a paid API. Read the [Evidence Report guide](docs/evidence-report.md) before sharing client research.

## Research recovery and future Studio

- [Resume paid Pain Quality and Omsk studies in GitHub Actions](docs/github-actions-resume.md) — restore previous evidence and per-item Jev checkpoints; newly paid API calls require explicit approval.
- [YA AI Studio roadmap](docs/yaai-studio-roadmap.md) — future local agent workspace, interactive reports, optional Kanban/Scrumban, content creation and reviewed publishing. **Planning only; not yet implemented.**
