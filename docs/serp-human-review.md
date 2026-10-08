# Independent human review of SERP relevance

This is a **small reproducible benchmark**, not a new Yandex/Jev research
run. It uses saved `serp.json` from a prior study, with no network or
billable API requests. Its primary goal is to detect **harmful exclusions**:
on-topic or potentially useful pages that a pre-Jev rule might have thrown
away.

## Review in a browser (no spreadsheet required)

Run the usual **prepare** command below. It now also creates
`pilot.review.html`, a fully self-contained offline review interface.
Open it locally in a browser and review one source at a time.

- The interface shows only source query, title, SERP excerpt and the URL
  (if you click it, an external website may open). It **does not embed**
  the filter's `exclude/review/keep` decision, reason or audit manifest.
- For each page choose relevance (yes/no/unclear) and whether it has a
  useful signal (yes/no/unclear); optional notes can record rationale.
  Keyboard shortcuts: **1–3** relevance, **4–6** usefulness; arrow keys
  navigate records (not while typing).
- Use **Save to CSV** regularly. The page intentionally does not
  silently write your private labels to a remote service or promise
  background autosaving. Later open the same HTML and use **Load CSV**
  to restore the exact previous progress. The import verifies the
  immutable source text, IDs and rating constraints.
- Send the exported `yaai-serp-review-labeled.csv` together with
  `pilot.manifest.json` to the `score` command or upload the CSV
  here for assistance. The CSV is compatible with `score` as a
  reviewer-blind, source-only file.

If you already have a `pilot.blind.csv` from an older run, make the page
without regenerating or paying for any research:

```bash
npm run pain:serp:review-ui -- \
  --blind /private/pilot.blind.csv \
  --html /private/pilot.review.html
```

Browser reviews are human judgments, not generated model truth. If a
page excerpt isn't enough, use `unclear` rather than guessing.

## The review procedure

```bash
npm run pain:serp:benchmark -- prepare \
  --serp /private/serp.json \
  --topic "обработка заявок" \
  --out /private/review/pilot \
  --size 48
```

Creates `pilot.blind.csv` for independent human review (without the
model's `decision` or `reason` columns), `pilot.csv` for transparent auditing,
and `pilot.manifest.json` binding original source IDs to machine decisions.
These are UTF-8 semicolon CSV files; **no human labels are generated automatically**.
Use **the blind CSV** or a spreadsheet converted from it for labeling. Keep the
full CSV/manifest out of the reviewer's view until labels are submitted.

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

Leave all source columns and source IDs untouched. The blind CSV contains **no decision column**.
`yes` for `gold_useful_signal` is allowed only when the page is labeled
`relevant`. `unclear` is encouraged if a SERP excerpt is insufficient for
a confident judgment. **Do not paste AI/Jev classifications into gold fields
and call them human labels.** If possible, have a second person label a
subset independently before reconciling disagreements.

The blind CSV hides the filter's `decision` and `reason` to reduce confirmation
bias; scores are reconstructed from the **separate immutable manifest** after
review. The full CSV can still be used for engineering diagnostics.

## Score the completed review

Export the edited **blind** spreadsheet as UTF-8 semicolon CSV with the existing
column names, then run:

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
