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

See **[docs/evaluation-layer.md](docs/evaluation-layer.md)**.

Secrets belong in the environment or GitHub Secrets, never in committed client data, scripts, logs or issue threads.

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
