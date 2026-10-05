---
name: cheap-evaluation
description: "Use saved Jev structured decisions as a cheap semantic gate before expensive analysis or generation."
---

# YAAI Cheap Evaluation

## Goal

Use Jev evaluation evidence to cheaply classify, score, and route large batches of leads, reviews, posts, transcripts, companies, or messages before asking a stronger generative model to reason or write.

## Workflow

1. Start with `yaai_workspace_overview`.
2. Read saved structured decisions with `yaai_evaluation_evidence`.
3. Separate rows into:
   - confident decisions;
   - `needsReview` rows below the configured certainty threshold.
4. Use the actual question probabilities and criteria from the saved evaluation profile.
5. Send only valuable or uncertain rows to a stronger model for explanations, offers, drafts, or deeper reasoning.
6. When the input came from platform research, optionally combine with `yaai_distribution_evidence` to preserve source/channel/content context.

## Output

Return:

1. **Measured decisions** — Jev choice/noul/score outputs and probabilities.
2. **Confident rows** — decisions that cleared the profile threshold.
3. **Review rows** — decisions that did not clear the threshold.
4. **Next expensive step** — only the smallest subset worth deeper analysis or generation.

## Guardrails

- Jev confidence/certainty is not ground-truth accuracy.
- Do not invent explanations that Jev did not return.
- Do not treat a `noul` probability as a separate confidence field; use its probability/certainty semantics.
- Keep arithmetic, counting, dates, lookups, and deterministic business rules in code, not Jev.
- Do not trigger live OpenRouter calls through MCP. Live evaluation uses explicit CLI commands with `--execute`.
- Do not automatically contact leads or publish/send generated content based only on Jev output.
