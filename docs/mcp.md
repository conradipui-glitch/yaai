# yaai MCP

`yaai` exposes a small local MCP server for AI agents. It is intentionally a thin adapter over the existing deterministic engine.

## What the MCP can do

- inspect a yaai workspace and available cases;
- re-run intent/query classification over the latest Wordstat result;
- build the Page Planner recommendations;
- compare the two latest dated snapshots;
- inspect a Yandex Webmaster query-to-URL CSV for overlap candidates;
- track Yandex Webmaster average positions across dates;
- analyze previously collected Yandex SERP competitor evidence;
- analyze previously collected platform/distribution evidence;
- summarize previously saved Jev/OpenRouter evaluation evidence.

The MCP surface is **read-only with respect to external services**: it does not call Wordstat, Webmaster, Yandex Search API, YouTube, Telegram, OpenRouter, or other live collection/model endpoints. Refresh/collect data through explicit CLI workflows first.

## Guided Local / Harness-first configuration

You can now generate a workspace and generic local MCP stdio config
without hand-editing paths:

~~~bash
npm run setup -- --mode harness --workspace /private/client/yaai --case client-seo
npm run setup -- --check --mode harness --workspace /private/client/yaai --case client-seo
~~~

The generated private `integrations/mcp.<case-id>.local.json` can be adapted to
your Harness's own MCP configuration. It is **not** an authenticated
remote MCP server and is **not** automatically installed in the client.
[Full setup instructions](local-setup.md).

## Start

From the engine repository:

```bash
npm run mcp -- --workspace ../silalesa/research/yaai --case silalesa-seo
```

Equivalent environment variables remain available:

```bash
YAAI_WORKSPACE=../silalesa/research/yaai \
YAAI_CASE_ID=silalesa-seo \
npm run mcp
```

The process uses stdio. stdout is reserved for MCP JSON-RPC messages; diagnostics go to stderr.

## Generic MCP client configuration

Use your actual checkout path:

```json
{
  "mcpServers": {
    "yaai": {
      "command": "node",
      "args": [
        "/absolute/path/to/yaai/mcp-server.mjs",
        "--workspace",
        "/absolute/path/to/silalesa/research/yaai",
        "--case",
        "silalesa-seo"
      ]
    }
  }
}
```

The server supports the current MCP `2026-07-28` discovery flow and the legacy `initialize` flow used by 2025-era clients.

## Tools

### `yaai_workspace_overview`

Returns the selected case, current result artifacts, snapshot count and engine capabilities.

### `yaai_analyze_latest`

Loads `<prefix>-wordstat-latest.json` and re-runs the deterministic intent/query classifier. Useful after editing presets or when an agent needs a compact view of demand signals and review candidates.

### `yaai_build_page_plan`

Builds page-level `CREATE / EXPAND / MERGE / HOLD` decisions from the latest classified data and planner profile. It does not write the result back to disk.

### `yaai_compare_snapshots`

Compares the two newest Wordstat snapshots for the selected case and reports growth, decline, newly observed queries and lost queries. If the case fingerprint changed, the result is marked as not directly comparable.

### `yaai_rank_tracker`

Reads a dated Webmaster CSV by a **workspace-relative path** and returns current average-position distribution, improvements, declines, new/lost queries, striking-distance opportunities and page-level movement. It does not start a Webmaster export.

### `yaai_serp_evidence`

Reads a normalized Yandex Search API SERP evidence JSON by a **workspace-relative path** and returns own-domain presence/absence, domains above the site, repeated competitor domains and observed result pages. It never performs a live search request.

### `yaai_distribution_evidence`

Reads a normalized platform evidence JSON by a **workspace-relative path** and analyzes the shared `Entity / ContentItem / MetricsSnapshot` model. It returns recurring entities, content-query links, latest observed counters, and metric deltas when repeated snapshots exist. It never performs a live platform request.
### `yaai_pain_evidence`

Reads a saved Pain Discovery JSON from a safe workspace-relative path, returning candidate pain cards, original Wordstat phrases and SERP citations. It performs **no paid Yandex or OpenRouter API calls**. Classification remains an unverified hypothesis.

### `yaai_evaluation_evidence`

Reads a saved Jev/OpenRouter Decisions evidence JSON by a **workspace-relative path**. It returns profile/model metadata, per-question outcome distributions, average certainty, review counts, and detailed evaluation rows up to the requested limit. It never calls OpenRouter.

### `yaai_webmaster_overlap`

Reads a Webmaster CSV by a **workspace-relative path** and finds queries associated with multiple URLs. Paths escaping the workspace are rejected.

Example argument:

```json
{
  "relativeCsvPath": "private/webmaster-query-pages.csv",
  "minImpressions": 10
}
```

### `yaai_tasks` and `yaai_task_detail`

List or inspect **draft work requests** and explicitly attached **saved JSON
results** from the same private workspace via CLI (`npm run task -- create ...`
and `npm run task -- link ...`). The MCP layer never creates, approves,
executes or completes tasks. A `draft` is an intention only, and a
`result_linked` status is a verified existing output, **not** a running or
completed YA AI job. `yaai_tasks` optionally filters by `caseId`;
`yaai_task_detail` takes a validated opaque `id`. See
[Task Registry](task-registry.md).

## Design boundary

The MCP adapter intentionally does not duplicate the engine:

```text
AI agent
   |
   v
MCP adapter
   |
   +--> analyzeRows()
   +--> buildPagePlan()
   +--> snapshot helpers
   +--> analyzeWebmasterCsv()
   +--> analyzeRankTrackerCsv()
   +--> analyzeSerpEvidence()
   +--> analyzeDistributionEvidence()
   +--> summarizeEvaluationEvidence()
   |
   v
yaai workspace
```

This keeps the decision logic testable outside any agent and prevents an LLM from becoming the source of SEO calculations.

## Validation

```bash
npm run mcp:selftest
npm run check
```

The self-test covers both modern and legacy MCP protocol paths plus every exposed tool using an isolated temporary workspace.

### Read-only local signal inbox

`yaai_signals` inspects notifications derived from persisted offline
task events, limited to the selected case. Set `unreadOnly: true`
to exclude locally acknowledged signals. The MCP has **no**
acknowledgement, messaging, paid invocation or task-write tool.
[Signal inbox](signal-inbox.md).

### Read-only offline execution status

The existing `yaai_tasks` and `yaai_task_detail` also show Stage 1C
local Webmaster CSV task runs, their attempts and integrity-checked output
paths. This is inspection only: **no new MCP executor tool is exposed**.
See [offline task execution](task-offline-execution.md).
