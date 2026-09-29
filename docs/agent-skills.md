# Agent Skills

`yaai` ships a small set of reusable Agent Skills in `.agents/skills/`. They describe **how an AI agent should use the yaai MCP tools**, not a second SEO engine.

The calculation boundary stays simple:

```text
Yandex data / workspace
        ↓
      yaai
 deterministic rules
        ↓
    MCP tools
        ↓
   Agent Skill
 workflow + explanation
        ↓
   human decision
```

## Included skills

### `yandex-keyword-research`

Turns the latest Wordstat result into a grounded demand map: commercial vs informational demand, important intents, confidence and rows that need review.

Primary tools:

- `yaai_workspace_overview`
- `yaai_analyze_latest`
- optionally `yaai_build_page_plan`

### `page-plan`

Explains and prioritizes yaai's page decisions:

- `CREATE`
- `EXPAND`
- `MERGE`
- `HOLD`

The skill is intentionally anti-cannibalization: it must not turn every keyword cluster into a new page.

Primary tool: `yaai_build_page_plan`.

### `rank-tracker`

Tracks Yandex Webmaster average positions across dates, highlights movers and default 5–20 striking-distance queries, and keeps query-level movement separate from page-level movement.

Primary tool: `yaai_rank_tracker`.

### `seo-review`

Combines current demand, page decisions, snapshot movement and optional Webmaster URL overlap into a compact review: what changed, what matters, what is uncertain, and what to do next.

### `content-gap`

Finds gaps in the site's own Yandex demand coverage: unmapped intents, missing page targets, generated planner targets and unresolved overlap.

This is **not yet competitor keyword gap**. Competitor/SERP gap should be added only after yaai has a real SERP/competitor evidence source.

### `seo-report`

Formats completed yaai research into a short decision report. It labels evidence as:

- **Measured** — returned by yaai/Yandex data;
- **Inference** — interpretation of measured evidence;
- **Unknown** — not measured yet.

It must not invent rankings, traffic, conversions, competitor metrics or forecasts.

## Using the skills

Clients that discover repository skills can read them directly from `.agents/skills/<name>/SKILL.md`.

For clients that only connect to MCP, keep the repository available to the agent alongside the yaai MCP server. The MCP provides facts and deterministic calculations; the skill provides the workflow and reporting discipline.

Example flow:

```text
"Проверь SEO проекта"

seo-review
  ├─ yaai_workspace_overview
  ├─ yaai_analyze_latest
  ├─ yaai_build_page_plan
  ├─ yaai_compare_snapshots
  ├─ yaai_rank_tracker (when a dated Webmaster CSV is available)
  └─ yaai_webmaster_overlap (when URL ownership needs investigation) (only when CSV is available)
```

## Safety and cost boundary

Agent Skills do not expand MCP permissions. The current MCP layer does not call paid Yandex APIs. Rank tracking analyzes an already downloaded Webmaster CSV and does not start a new export. A skill can analyze already collected data, but a fresh Wordstat/Webmaster collection still uses the explicit existing yaai collection workflows.

## Validation

```bash
npm run skills:selftest
npm run check
```

The self-test verifies all five skills exist, have valid metadata, and reference only MCP tools actually exposed by `mcp-server.mjs`.
