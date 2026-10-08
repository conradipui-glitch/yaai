---
name: pain-discovery
description: "Investigate customer problems using saved Yandex Wordstat/SERP evidence and Jev classifications without inventing demand."
---

# YAAI Pain Discovery

## Goal

Turn observed search phrases and Yandex SERP excerpts into **candidate audience pains** with traceable evidence. Preserve uncertainty and request human verification before treating pain hypotheses as product facts.

## Workflow

1. Inspect `yaai_workspace_overview`.
2. Collect Wordstat with explicit CLI `pain:wordstat` (or reuse an existing saved Wordstat batch).
3. Generate a bounded Yandex search plan with `pain:prepare`, review its query file, then collect results with existing `serp:collect`.
4. Explicitly run `pain:analyze --execute` to classify collected observations using Jev.
5. Read saved map with `yaai_pain_evidence`. Link every suggested pain to its actual Wordstat phrase or SERP title, passage, and URL.
6. For evidence needing validation, inspect source content or ask a human. Propose business or content tests only after marking the uncertain parts.

## Output

For each candidate pain show the controlled pain category, observed Wordstat phrases and their separate non-additive counts, excerpt URLs, which claims came from the source, source age/region, and review status. Distinguish a search phrase from a firsthand complaint. Prioritize user-facing opportunities by independent evidence quality, not by Jev confidence alone.

## Human quality audit

1. Prepare a source-only review queue from the saved Pain Map using `pain:review`.
2. Have a human label both accepted and rejected Jev observations; `pain:review:interactive` resumes unfinished work.
3. Use `pain:quality` for sample precision, recall, source validation coverage, and cost per validated true positive.
4. Never call model probabilities or synthetic fixtures real-world precision/recall.
5. If there are insufficient manual labels, mark quality as unproven and do not claim the model achieved a target.
## Guardrails

- Wordstat counts overlap and are not unique people, leads, market size or proof of purchase intent.
- Generated search queries are probes, not measured Wordstat demand.
- A SERP snippet is a search-result excerpt, not a verified user quotation; do not claim to have read full pages.
- Seller advertising text is not automatically a dissatisfied customer statement.
- Jev confidence is not an accuracy guarantee. Keep classification and hypotheses separate from facts.
- Avoid high-cost unattended collection; only explicit CLI `--execute` may contact Yandex/OpenRouter.
- Never contact businesses or individuals based solely on a Pain Map.
