# Jev evaluation layer

`yaai` can use TypeSafe Jev through OpenRouter as a cheap structured semantic gate before expensive reasoning or generation.

The default pinned model is:

```text
typesafe/jev-1.13
```

Jev is called through OpenRouter's Decisions API, not chat completions. It returns typed decisions rather than generated prose.

## Credential

The preferred repository/environment variable is:

```text
YAIS_AI=...
```

Fallback aliases:

```text
OPENROUTER_API_KEY=...
YAAI_OPENROUTER_API_KEY=...
```

Optional model override:

```text
YAAI_JEV_MODEL=typesafe/jev-1.13
```

The API key must never be committed to the repository or written into evidence files.

## Decision primitives

An evaluation profile defines one or more Jev questions:

- `choice` — choose one option from criteria defined by the profile;
- `noul` — probability that a proposition is true;
- `score` — probability-weighted position on an ordered scale.

Example:

```json
{
  "id": "lead-qualification-v1",
  "reviewThreshold": 0.8,
  "questions": {
    "active_need": {
      "type": "noul",
      "instructions": "Does the state contain evidence of an active current need?"
    },
    "urgency": {
      "type": "score",
      "instructions": "How urgent is the need?",
      "criteria": [
        "No current need",
        "Possible future need",
        "Active need",
        "Near-term or immediate need"
      ]
    }
  }
}
```

Two neutral profiles ship in:

```text
examples/evaluation-profiles/lead-qualification.json
examples/evaluation-profiles/content-intelligence.json
```

## Generic batch evaluation

Input can be an array or an object containing `items`. Each item requires `id` and `state`:

```json
{
  "items": [
    {
      "id": "lead-001",
      "state": {
        "targetOffer": "AI automation audit",
        "company": "Example",
        "text": "We need to automate lead qualification this month."
      },
      "meta": {
        "source": "website"
      }
    }
  ]
}
```

Run:

```bash
npm run jev:evaluate -- \
  --input /private/items.json \
  --profile examples/evaluation-profiles/lead-qualification.json \
  --out /private/evaluation-results.json \
  --execute
```

The evaluator saves:

- item id and metadata;
- a SHA-256 hash of the evaluated state;
- the exact model snapshot/provider returned by OpenRouter;
- typed answers and probability distributions;
- derived certainty;
- whether the item falls below the configured review threshold;
- token/cost usage.

The raw state is **not duplicated into the output by default**.

## Distribution evidence evaluation

YouTube/Telegram content can be evaluated directly:

```bash
npm run jev:distribution -- \
  --input /private/telegram-evidence.json \
  --profile examples/evaluation-profiles/content-intelligence.json \
  --limit 100 \
  --out /private/content-evaluations.json \
  --execute
```

The adapter turns each `ContentItem` into Jev state containing:

- platform;
- content type;
- source entity;
- title;
- text;
- outbound links;
- publication time.

Text is capped by `--max-chars` (default 24,000 characters) to keep a single decision request bounded.

## Review routing

The profile can define:

```json
{
  "reviewThreshold": 0.8,
  "reviewQuestions": ["fit", "active_need"]
}
```

If `reviewQuestions` is omitted, every answer participates in the review gate.

For `choice` and `score`, the API confidence is used as the certainty signal.

For `noul`, the derived certainty is:

```text
max(p, 1 - p)
```

This measures how far the yes/no probability is from ambiguity around 0.5. It is **not** a guarantee that the answer is correct.

Thresholds must eventually be calibrated on labeled examples from the actual domain.

## MCP boundary

Live model calls are never exposed through MCP.

The workflow remains:

```text
explicit CLI --execute
        ↓
OpenRouter Decisions / Jev
        ↓
saved evaluation evidence
        ↓
yaai_evaluation_evidence
        ↓
Agent Skill / stronger model / human
```

The MCP tool `yaai_evaluation_evidence` only reads and summarizes a saved JSON file inside the selected yaai workspace.

## Intended uses

Good Jev tasks:

- lead fit;
- active-need detection;
- urgency;
- message/post routing;
- content type;
- commercial-signal detection;
- review classification;
- bounded semantic scoring.

Keep these outside Jev:

- arithmetic and aggregation;
- exact dates and date comparisons;
- deterministic lookups;
- scraping/collection;
- prose generation;
- offer/message/landing-page writing;
- actions such as contacting a lead.

A stronger generative model should receive only the rows that are valuable or uncertain enough to justify deeper reasoning or writing.

## Cost and safety

Every live call requires explicit `--execute`.

The model is intentionally pinned to `typesafe/jev-1.13` by default so changes to a moving alias do not silently change classification behavior. Change `YAAI_JEV_MODEL` deliberately when testing a newer model.

OpenRouter pricing and model behavior can change. Use the returned `usage.cost` for measured run cost rather than hard-coding an assumed price.
