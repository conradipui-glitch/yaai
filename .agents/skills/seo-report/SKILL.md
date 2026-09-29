---
name: seo-report
description: "Turn completed yaai analysis into a concise, evidence-labeled SEO decision report for a human owner or project team."
---

# YAAI SEO Report

## Goal

Convert yaai evidence into a decision-oriented report that answers:

- what the data says;
- what should change;
- why that action is justified;
- what is still unknown.

This skill formats already-completed research. It does not replace the research tools.

## Inputs

Use the relevant yaai tools before writing:

- `yaai_workspace_overview` — project/data context;
- `yaai_analyze_latest` — demand and intent evidence;
- `yaai_build_page_plan` — page actions;
- `yaai_compare_snapshots` — Wordstat demand change over time;
- `yaai_rank_tracker` — Yandex Webmaster average-position movement;
- `yaai_webmaster_overlap` — optional URL ownership/overlap evidence.

Do not call tools merely to fill sections that are irrelevant to the user's question.

## Report structure

### 1. Executive summary

3–5 bullets:
- strongest measured signal;
- most important action;
- meaningful change since the prior snapshot, if comparable;
- largest uncertainty/blocker.

### 2. Evidence

Use a compact table with:
- signal;
- source/tool;
- measured value or planner decision;
- interpretation;
- confidence/limitation.

### 3. Actions

Order actions using yaai's Page Planner priorities. For each action state:
- **Do** — concrete page/preset/planner change;
- **Why** — evidence;
- **Expected effect** — qualitative mechanism only unless a measured forecast exists;
- **Evidence type** — Measured / Inference.

### 4. Do not do

Call out tempting but unsupported moves, especially:
- creating duplicate pages for close keyword variants;
- treating overlap as proven cannibalization;
- summing Wordstat phrase counts into market size;
- treating stale or non-comparable snapshots as clean trend data.

### 5. Next measurement

Name the one next dataset/run that would reduce uncertainty most.

## Writing rules

- Short, plain language; explain SEO terms when needed.
- Facts from tools are **Measured**.
- Conclusions derived from them are **Inference**.
- Missing evidence is **Unknown**.
- Never invent traffic, conversion, revenue, competitor, backlink, technical-audit, or SERP metrics. When rank data exists, call it Yandex Webmaster **average position**, not an exact live rank.
- Keep the report useful to a business owner, not only an SEO specialist.
- Prefer five well-supported actions over twenty generic recommendations.
