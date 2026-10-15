# Knowledge Layer v1 — CTR and conversion explained in YA AI

The existing **local YA AI web interface** now includes the first
contextual learning feature. This is a **small, working vertical slice**
of the proposed larger Knowledge Layer; it is not yet a universal
help system for the whole product, nor a cloud-hosted Studio.

## What a user sees

Open the **existing local UI** (not the public VPS reader):

~~~bash
npm start -- --workspace /private/client-a
~~~

On the top of the Wordstat page, next to the normal workflow, there is
a **Knowledge Layer** card with clickable **CTR** and **Конверсия — CVR**
terms. Hovering or focusing shows the short definition; clicking opens a
responsive drawer. Keyboard behavior: Escape closes, focus stays in
the drawer while it is open, and closing returns focus to the trigger.

Inside each concept:

1. Simple meaning and formula;
2. What happens mechanically, with an advertising example;
3. Practical product/PM decisions;
4. How the **existing offline** YA AI metric signal rules use it;
5. Common errors, statistical/attribution limits and a related term;
6. A live sample calculator that changes CTR/CVR as numbers are edited.

### Calculator is a teaching tool, not the production rule engine

The two-week input defaults are **synthetic**, NOT customer metrics:
previous 10,000 impressions, 1,000 clicks, 150 conversions;
current 10,000 impressions, 300 clicks, 9 conversions.

The calculator applies:

- CTR = clicks / impressions;
- CVR = conversions / clicks;
- relative change = new rate / old rate − 1.

It refuses invalid integers, clicks above impressions and conversions
above clicks. If a denominator is zero, it says **нет данных** rather
than reporting an invented 0%. A difference from a zero baseline is
undefined and reported as such. **No request, API fee, project write,
metric signal, or advertising action** occurs when editing these fields.

This panel does NOT reimplement the actual rule decision/Wilson
confidence checks or claim that an alert would or would not trigger.
For an actual evidence-grounded detection, use
\`npm run metrics:check -- --workspace ... --case ...\`, which evaluates
validated weekly imports and requires explicit \`--save\` for signals.

## Keeping help accurate when calculations change

The educational text in \`public/knowledge-content.js\` explicitly
references \`ad-metrics-weekly-v1\`. The reviewed rule source is pinned
in \`docs/knowledge-metrics-source.json\` with a Git blob content hash
of \`lib/metric-rules.mjs\`.

\`npm run knowledge:selftest\` (included in \`npm run check\` and CI):

- Fails whenever **any** byte of the real metric-rule implementation
  changes without an accompanying review;
- Checks topic coverage, expected thresholds and critical warnings;
- Computes calculator numbers alongside the **actual** backend
  \`evaluateMetricSnapshot()\` for the documented synthetic weeks;
- Validates absence of a network call in the help UI, keyboard-dialog
  markup, visible help triggers, and error guards.

When \`lib/metric-rules.mjs\` changes, do **not** blindly copy its new
Git hash to fix CI. Instead, review the definitions, examples,
thresholds, attribution limitations and sample parity; update help
content where needed; then update \`engineGitBlobSha1\` to the reviewed
source's current blob hash. This is a **CI drift alarm, not an
automated fact-check** or a guarantee of statistical correctness.

## Honest scope and next steps

- No auto-discovery of changed Yandex/Google external documentation or
  provider prices. Future refresh checks need source provenance,
  versioned links and approvals.
- No modal on the read-only VPS server and no insecure public exposure
  of \`server.mjs\`. The existing local-only security model remains.
- No general page planner or Wordstat term descriptions yet.
- Knowledge content is curated in source control and does not use a
  paid generative model.
- Next steps: convert more actual UI labels to help triggers; add
  sources/diagrams, versioned editorial updates and a unified Studio
  shell only after user-visible utility is proven.

See [metric evidence policies](weekly-metric-rules.md) and
[project delivery roadmap](yaai-delivery-plan.md).
