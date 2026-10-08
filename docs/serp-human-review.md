# Independent human review of SERP relevance

This is a **small reproducible benchmark**, not a new Yandex/Jev research
run. It uses saved `serp.json` from a prior study, with no network or
billable API requests. Its primary goal is to detect **harmful exclusions**:
on-topic or potentially useful pages that a pre-Jev rule might have thrown
away.

## The review procedure

```bash
npm run pain:serp:benchmark -- prepare \
  --serp /private/serp.json \
  --topic "обработка заявок" \
  --out /private/review/pilot \
  --size 48
```

Creates `pilot.csv` (UTF-8, semicolon-delimited, readable in Excel and
LibreOffice) and `pilot.manifest.json` (the fixed source and rule decisions).
Both are private files. **No human labels are generated automatically.**

The 48-row target is approximately evenly split between:
- `exclude`: snippets automatically removed **before** Jev;
- `review`: ambiguous snippets retained for investigation;
- `keep`: snippets retained without a clear conflict.

If a group has fewer available items, the remaining capacity is redistributed.
Selection is repeatable for the same input and seed, with search queries
diversified within each group. Sampling is **purposive/stratified, not
representative** of the overall prevalence of irrelevant pages. Outcomes must
not be extrapolated to all SERP results.

A human reviewer should **read the title/excerpt, open source URLs where
possible, and independently fill only these columns**:

| Column | Allowed values | Meaning |
|---|---|---|
| `gold_relevance` | `relevant` / `irrelevant` / `unclear` | Is the page about the research topic? |
| `gold_useful_signal` | `yes` / `no` / `unclear` | Does it contain a potentially useful customer/market signal *for this topic*? |
| `reviewer_note` | free text | Reason, caveat, evidence of relevance |

Leave all source columns, source IDs, and the `decision` column untouched.
`yes` for `gold_useful_signal` is allowed only when the page is labeled
`relevant`. `unclear` is encouraged if a SERP excerpt is insufficient for
a confident judgment. **Do not paste AI/Jev classifications into gold fields
and call them human labels.** If possible, have a second person label a
subset independently before reconciling disagreements.

The reviewer should *not* treat `decision` as the ground truth. A filtered
review view hiding `decision` from labelers can further reduce confirmation
bias; the benchmark still retains the machine decision for scoring.

## Score the completed review

Export the edited spreadsheet as UTF-8 semicolon CSV with the existing column
names, then run:

```bash
npm run pain:serp:benchmark -- score \
  --manifest /private/review/pilot.manifest.json \
  --labels /private/review/pilot-labeled.csv \
  --out /private/review/quality.json
```

The script verifies all IDs, rows, and immutable source columns. It rejects
invalid labels, changed decisions, duplicated rows, or altered source text.
It reports **separately** for excluded, ambiguous and kept sources:
number reviewed, relevant, irrelevant, unclear, and still unlabeled.
The exclusion group has two meaningful descriptive indicators:

- **Correct exclusion share among labeled exclusions:** those marked
  `irrelevant` divided by relevant-or-irrelevant labels in that group.
- **Harmful exclusion share among labeled exclusions:** those marked
  `relevant` divided by the same group.

It also counts human-labeled **useful signals excluded vs preserved**.
Percentages are hidden until at least five decisive independent labels
exist in the exclusion group. These are **sample-only numbers**, not
statistically valid full-population error rates.

Output `status` stays `awaiting_independent_labels` until every reviewed
row has a decisive `relevant` or `irrelevant` judgment and a usefulness
label. Without human annotations **there is no measured accuracy**.

## Why the real saved search is instructive

In a past study of handling customer inquiries, the phrase
`дорогой лиде` was irrelevant as a *Wordstat query*, but Yandex returned
real pages about advertising lead costs, CPL and acquisition. The previous
query-level reject-all rule risked removing on-topic pages. Now a suspicious
query alone triggers **review**, not exclusion. Only unmistakable
**page-level** contradictions can trigger automatic removal.

This is tested offline. Real human review must verify that the adjusted
rule works in practice; lexical matches, seller promotion, novelty and
search rank cannot themselves prove a source is relevant or useful.

## Data handling and limitations

Retain raw SERP and `pilot.manifest.json` together. Do not commit client
research excerpts, source URLs, completed labels or your private report to a
public repository. The review pack exposes source text and URLs; it may
include copyrighted excerpts or personal information. Review it before
sharing.

No fresh pages are fetched, so a changed website can disagree with its
historical SERP excerpt. This is a review of **saved search evidence**.
Follow-up analysis of recall/precision across the entire search population
needs either exhaustive review or a separately designed randomized study
with explicit stratification weights and uncertainty estimates.

Offline tests: `node scripts/serp-relevance-benchmark-selftest.mjs`.
