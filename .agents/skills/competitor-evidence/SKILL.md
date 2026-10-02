---
name: competitor-evidence
description: "Use saved Yandex Search API SERP evidence to identify repeated competing domains, pages above the site, and queries where the site is absent."
---

# YAAI Competitor Evidence

## Goal

Use a real Yandex SERP snapshot to answer:

- which domains repeatedly appear across the selected queries;
- where the site's domain is present or absent;
- which competitor pages sit above the site's page;
- whether an apparent content gap has external SERP evidence behind it.

This skill does not estimate competitor traffic, revenue, authority, backlinks, or keyword difficulty.

## Required context

Start with `yaai_workspace_overview`.

A SERP evidence JSON collected by the explicit `serp:collect` workflow must be available inside the selected workspace. If the site's own domain is not stored in that file, provide it to `yaai_serp_evidence`.

## Workflow

1. Call `yaai_workspace_overview`.
2. Call `yaai_serp_evidence` with the workspace-relative evidence file.
3. Review:
   - repeated competitor domains by `queryCount`;
   - own-domain presence/absence by query;
   - `domainsAboveOwn` for queries where the site is visible;
   - top result URLs and titles as evidence of the page types currently ranking.
4. Cross-check important queries with `yaai_analyze_latest` when Wordstat demand priority matters.
5. Cross-check with `yaai_rank_tracker` when first-party average-position history exists.
6. Use `yaai_build_page_plan` for the final CREATE / EXPAND / MERGE / HOLD route.
7. Treat SERP evidence as one observed snapshot for one region/time, not a permanent competitor ranking.

## Output

Return:

1. **Who repeatedly appears** — domains with the number of covered queries and best observed position.
2. **Where we are absent** — queries where the own domain is missing from the analyzed top N.
3. **Who is above us** — for visible queries, the domains/pages ahead of the site's best result.
4. **What the ranking pages suggest** — observed page type/title patterns, clearly labeled as inference.
5. **What this changes in the plan** — only where SERP evidence strengthens or weakens an existing Page Planner hypothesis.

## Guardrails

- Never infer competitor traffic, conversions, revenue, backlinks or domain authority from SERP presence.
- Never call a repeated domain "the strongest competitor" without defining the limited metric: repeated presence in this collected query set.
- Never override Page Planner directly; use SERP data as evidence for a human/agent decision.
- Do not treat one collection as a trend.
- Do not trigger live Yandex Search API collection through MCP. Collection requires the explicit CLI workflow and `--execute`.
