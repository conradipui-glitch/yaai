---
name: content-gap
description: "Find uncovered or weakly covered search demand using yaai demand, Page Planner, Webmaster evidence, and optional Yandex SERP competitor evidence."
---

# YAAI Content Gap

## Goal

Find demand the current site structure does not cover well enough.

A gap can now be supported by first-party Yandex data and, when a saved SERP evidence file exists, by observed competitor/result pages. Competitor evidence is optional and must come from `yaai_serp_evidence`, not from agent memory.

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
5. If a saved SERP evidence JSON is available, call `yaai_serp_evidence` and check whether the own domain is absent, which domains repeatedly rank, and which pages appear above the site.
6. If a Webmaster CSV is available, call `yaai_webmaster_overlap` and use overlap only as supporting evidence that current page ownership is unclear.
7. Separate a real content gap from an architecture gap:
   - **content gap** — useful search intent is not adequately covered;
   - **mapping gap** — content/page may exist but yaai's preset/planner does not know where it belongs;
   - **overlap risk** — multiple URLs receive the same query;
   - **no action** — low-value/noise demand.
8. For each gap, recommend one of: map to existing page, expand existing page, create page/guide, refine preset, or hold. SERP evidence may strengthen/weaken the hypothesis but does not override Page Planner automatically.

## Output

Use a table:

| Gap | Type | Evidence | Recommended action | Confidence |
|---|---|---|---|---|

Then provide:

- **Top gaps worth resolving now** — maximum five.
- **Likely configuration gaps** — what should be fixed in preset/planner before creating content.
- **Competitor evidence** — where a saved SERP snapshot supports the gap and which observed pages/domains provide that evidence.
- **Not proven yet** — anything still missing first-party or SERP evidence.

## Guardrails

- Never label a gap "competitor gap" without `yaai_serp_evidence` data.
- Never interpret every unmapped phrase as a new-page opportunity.
- Prefer mapping/expanding an existing page over CREATE when the evidence supports it.
- Do not invent page inventory or current rankings.
