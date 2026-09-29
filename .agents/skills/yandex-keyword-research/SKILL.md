---
name: yandex-keyword-research
description: "Turn the latest Yandex Wordstat data in a yaai workspace into a grounded demand map and a short list of search opportunities."
---

# Yandex Keyword Research

## Goal

Use yaai's deterministic Yandex data to explain what people are searching for, which intents matter, and what deserves attention next.

This skill is analysis-first. Do not invent search volume, intent, region, confidence, or page recommendations.

## Required context

- A yaai MCP server connected to the target workspace.
- A case id when the workspace has more than one case.
- Fresh enough Wordstat results for the user's decision.

Start with `yaai_workspace_overview`. If the latest data is missing or clearly stale for the requested decision, say that a collection refresh is required. Do not silently substitute web estimates.

## Workflow

1. Call `yaai_workspace_overview` and confirm the selected case.
2. Call `yaai_analyze_latest` with associations disabled unless the user explicitly wants discovery noise included.
3. Read the returned demand signals by intent, region, query type, confidence and strongest phrase.
4. Separate:
   - commercial demand;
   - informational demand;
   - unmapped/low-confidence queries that need review;
   - noise/hold material.
5. Prioritize practical opportunities using the evidence yaai actually returns:
   - business priority;
   - relative demand band/rank;
   - strongest query count;
   - intent confidence;
   - whether the query belongs to a Landing, Guide or Hold route.
6. If page decisions are needed, continue with `yaai_build_page_plan` instead of guessing URLs.
7. State data limitations explicitly. Wordstat counts are not to be summed into a market-size estimate.

## Output

Return:

1. **Demand picture** — 3–7 concise findings grounded in returned data.
2. **Best current opportunities** — a compact table with intent/query theme, type, region, signal, confidence and next action.
3. **Needs review** — important unmapped or low-confidence rows.
4. **Next step** — one concrete action, usually Page Planner, preset refinement, or a fresh Wordstat run.

## Guardrails

- Never invent missing Yandex metrics.
- Never describe association rows as validated demand unless explicitly included and labeled.
- Never sum overlapping Wordstat phrases into "total market".
- Prefer yaai's deterministic intent/action output over LLM reinterpretation.
- This skill does not call paid Yandex APIs through MCP.
