---
name: content-gap
description: "Find uncovered or weakly covered search demand inside a yaai case using unmapped intents, HOLD rows, Page Planner gaps, and optional Webmaster overlap evidence."
---

# YAAI Content Gap

## Goal

Find demand the current site structure does not cover well enough.

In this phase, "content gap" means **first-party/site-structure gap in Yandex data**, not competitor keyword gap. Do not claim competitor coverage without a SERP/competitor data source.

## Workflow

1. Call `yaai_workspace_overview`.
2. Call `yaai_analyze_latest` with review rows enabled.
3. Call `yaai_build_page_plan`.
4. Look for these gap types:
   - important unmapped or low-confidence demand;
   - commercial demand routed to HOLD because a target is missing;
   - informational demand with no suitable Guide target;
   - generated Page Planner targets that indicate the preset/planner lacks an explicit page mapping;
   - strong themes spread across several weak mappings that deserve preset refinement.
5. If a Webmaster CSV is available, call `yaai_webmaster_overlap` and use overlap only as supporting evidence that current page ownership is unclear.
6. Separate a real content gap from an architecture gap:
   - **content gap** — useful search intent is not adequately covered;
   - **mapping gap** — content/page may exist but yaai's preset/planner does not know where it belongs;
   - **overlap risk** — multiple URLs receive the same query;
   - **no action** — low-value/noise demand.
7. For each gap, recommend one of: map to existing page, expand existing page, create page/guide, refine preset, or hold.

## Output

Use a table:

| Gap | Type | Evidence | Recommended action | Confidence |
|---|---|---|---|---|

Then provide:

- **Top gaps worth resolving now** — maximum five.
- **Likely configuration gaps** — what should be fixed in preset/planner before creating content.
- **Not proven yet** — anything that requires SERP/competitor evidence.

## Guardrails

- Never label a gap "competitor gap" without competitor data.
- Never interpret every unmapped phrase as a new-page opportunity.
- Prefer mapping/expanding an existing page over CREATE when the evidence supports it.
- Do not invent page inventory or current rankings.
