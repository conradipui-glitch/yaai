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

### `competitor-evidence`

Analyzes a saved Yandex Search API SERP snapshot: repeated competitor domains, own-domain presence/absence, and pages/domains observed above the site.

Primary tool: `yaai_serp_evidence`.

### `distribution-intelligence`

Analyzes normalized platform evidence across the shared entity/content/metrics model: recurring creators/channels, topic discovery paths, observed counters, and metric movement when repeated snapshots exist.

Primary tool: `yaai_distribution_evidence`.
### `seo-review`

Combines current demand, page decisions, snapshot movement and optional Webmaster URL overlap into a compact review: what changed, what matters, what is uncertain, and what to do next.

### `content-gap`

Finds gaps in the site's Yandex demand coverage: unmapped intents, missing page targets, generated planner targets and unresolved overlap. When a SERP evidence file exists, it can also test whether the own domain is absent and which observed competitor pages occupy the query.

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
  ├─ yaai_serp_evidence (when a saved SERP snapshot is available)
  └─ yaai_webmaster_overlap (when URL ownership needs investigation)
```

## Safety and cost boundary

Agent Skills do not expand MCP permissions. The current MCP layer does not call paid Yandex APIs. Rank tracking analyzes an already downloaded Webmaster CSV and does not start a new export. SERP and distribution skills analyze already collected evidence files and do not perform live searches or platform requests through MCP. Fresh Wordstat/Webmaster/SERP/YouTube collection uses explicit CLI workflows.

## Validation

```bash
npm run skills:selftest
npm run check
```

The self-test verifies every shipped skill exists, has valid metadata, and references only MCP tools actually exposed by `mcp-server.mjs`.
