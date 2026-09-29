---
name: seo-review
description: "Run a compact evidence-based SEO review from yaai demand, Page Planner, snapshots, and optional Webmaster overlap data."
---

# YAAI SEO Review

## Goal

Answer: what changed, what matters now, and what should be done next — using only evidence available in yaai.

This is not yet a full technical crawler audit. Do not claim to have checked status codes, canonicals, Core Web Vitals, backlinks, or SERPs unless another connected tool actually supplied them.

## Workflow

1. Call `yaai_workspace_overview`.
2. Call `yaai_analyze_latest` for current demand and review candidates.
3. Call `yaai_build_page_plan` for page-level actions.
4. Call `yaai_compare_snapshots` when two or more snapshots exist.
5. If the user supplies a Webmaster CSV path, call `yaai_webmaster_overlap`.
6. Cross-check findings:
   - growing demand + EXPAND/CREATE = stronger opportunity;
   - declining demand = context, not automatic deletion;
   - overlap candidates = investigate, not proof of harmful cannibalization;
   - unmapped/low-confidence = configuration/research debt.
7. Rank attention by current business priority and evidence strength, not by dramatic wording.

## Output

Return four sections:

1. **What is happening** — current demand and meaningful movement.
2. **What to change** — highest-value Page Planner actions.
3. **Risks / uncertainty** — overlap candidates, low-confidence mappings, changed case definitions, stale data.
4. **Next check** — one concrete follow-up.

For every recommendation, distinguish:
- **Measured** — returned directly by yaai/Yandex data;
- **Inference** — interpretation of measured data;
- **Unknown** — not yet measured.

## Guardrails

- An overlap candidate is not proof of cannibalization.
- A snapshot comparison with changed case fingerprint is diagnostic, not a clean trend.
- Do not invent rankings or traffic.
- Do not present this as a full technical SEO audit.
