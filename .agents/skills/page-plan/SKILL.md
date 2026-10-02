---
name: page-plan
description: "Convert yaai demand signals into grounded CREATE, EXPAND, MERGE, and HOLD page decisions while minimizing cannibalization."
---

# YAAI Page Plan

## Goal

Decide what should happen to site pages using yaai's existing Page Planner rather than generating a generic SEO content list.

## Required context

Start with `yaai_workspace_overview`. Then use `yaai_build_page_plan`.

If there is no current Wordstat/intents result, stop and say which input is missing. Do not manufacture a plan from memory.

## Workflow

1. Call `yaai_workspace_overview`.
2. Call `yaai_build_page_plan` with associations disabled by default.
3. Read the planner decisions exactly as returned:
   - **EXPAND** — strengthen an existing page;
   - **CREATE** — create a distinct new page;
   - **MERGE** — cover the demand inside an existing primary page/section;
   - **HOLD** — do not create a page yet.
4. Respect `businessPriority`, `focusWeight`, `plannerScore`, `priorityBand`, strongest query and region evidence.
5. Treat `now / next / later` as yaai's working prioritization, not an absolute business guarantee.
6. Before recommending a new page, check that yaai did not already route the theme to EXPAND or MERGE.
7. If a saved SERP evidence file is available for the important queries, call `yaai_serp_evidence` to see what page types/domains are actually ranking. Use it only as supporting evidence.
8. If the user asks why, explain the demand, current page ownership, SERP evidence and anti-cannibalization logic in plain language.

## Output

Use a compact table:

| Priority | Decision | Page / section | Why | Evidence |
|---|---|---|---|---|

Then add:

- **Do now** — no more than five items.
- **Do not split into separate pages** — MERGE/EXPAND cases where duplication would be wasteful.
- **Hold/review** — unresolved demand and what evidence is missing.

## Guardrails

- Do not override CREATE / EXPAND / MERGE / HOLD from SERP evidence alone. If you disagree with the deterministic route, label that as a hypothesis and explain the evidence.
- Do not invent target URLs.
- Do not convert every keyword cluster into a page.
- Do not sum Wordstat counts across variants.
- Keep the smallest page architecture that covers the observed demand.
