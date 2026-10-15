# Weekly advertising metric signals — Stage 3C (offline, dry-run first)

YA AI can now compare **two adjacent, completed 7-day periods** of manually
imported advertising metrics and produce **review suggestions** linked to
the private, case-scoped signal inbox. This is *not* a live Yandex Direct,
Metrica or Google Ads connector and does **not** know account balances,
advertising settings, customer identity or click fraud.

The user supplies the source data. The software validates arithmetic,
time windows and sample size before evaluating three deterministic rules.
Any conclusion is **a prompt for human investigation**, not an
instruction to pause a campaign or proof of the cause of the change.

## Input format and provenance

Save a UTF-8 JSON file outside the public engine repository at
\`WORKSPACE/inputs/<case-id>/ad-metrics.json\`. Exact shape:

~~~json
{
  "schemaVersion": 1,
  "caseId": "client-a",
  "campaignId": "roof-search",
  "currency": "RUB",
  "source": "manual-export",
  "periods": {
    "baseline": {
      "startDate": "2026-09-28",
      "endDate": "2026-10-04",
      "complete": true,
      "impressions": 10000,
      "clicks": 1000,
      "spendRub": 10000,
      "conversions": 150,
      "conversionsFinalized": true
    },
    "current": {
      "startDate": "2026-10-05",
      "endDate": "2026-10-11",
      "complete": true,
      "impressions": 10000,
      "clicks": 300,
      "spendRub": 16500,
      "conversions": 9,
      "conversionsFinalized": true
    }
  }
}
~~~

These numbers are **synthetic demonstration values**, not observed
advertising results. A user must manually supply their own data and
check both periods measure comparable campaign settings, tracking,
attribution and traffic type. \`conversionsFinalized: true\` should
be set only when attribution/reporting delays have ended for that week;
there is no automatic guarantee of completeness.

All fields are required. Data must use RUB, positive or zero finite
amounts, and \`conversions <= clicks <= impressions\`. Periods must
be exactly seven days each, consecutive without gaps or overlaps,
and marked complete. The initial rule engine deliberately refuses
different durations, multiple campaigns per file, or ambiguous currency
conversions rather than silently normalizing incomparable metrics.

The label \`source: "manual-export"\` is **self-reported provenance**,
not proof that data came from the advertiser's authenticated account.

## Rules and eligibility

| Rule | Minimum evidence and trigger | What it does NOT establish |
| --- | --- | --- |
| Spend increase | Baseline spend ≥1,000 ₽, both periods ≥1,000 impressions, impression change within ±10%, and new spend ≥150% of baseline | Fraud, unprofitable ROAS, wrong bidding |
| CTR decline | Both periods ≥1,000 impressions, baseline ≥30 clicks, CTR down ≥30% *and* non-overlapping 95% Wilson proportion intervals | Cause, significance in a fully specified experiment, low-quality traffic |
| Conversion-rate decline | Each period ≥150 clicks, baseline ≥20 conversions, reporting marked finalized for BOTH weeks, conversion rate down ≥40% *and* separated Wilson intervals | Malfunctioning tracking, bad ads or guaranteed lost sales |

Wilson intervals are a *conservative descriptive screen* for proportions,
not a causal/statistical model of randomized campaigns. Ad impressions
and click events may be correlated, and seasonality or different auction
conditions can make week-to-week observations incomparable.

**Suppressed rules are still shown with a reason**, including missing
sample size and not-finalized conversions. There is no low-CTR or
zero-conversion panic alarm from a handful of clicks.

## Preview, save and signal history

Dry-run by default:

~~~bash
npm run metrics:check -- \
  --workspace /private/client-a \
  --case client-a
~~~

This reads the import, prints all rule outcomes and evidence/limitations,
makes **zero API requests**, and writes **nothing**.

After reviewing it, save the bounded evaluation:

~~~bash
npm run metrics:check -- \
  --workspace /private/client-a \
  --case client-a --save
~~~

This creates one immutable, owner-only report under
\`tasks/metric-checks/<case-id>/\`, recording the exact file
SHA-256, normalized snapshot, rule version, checks and flagged findings.
A second save of the same imported content is idempotent and creates
no duplicates. A **changed import** produces a different report ID,
preserving earlier review history.

Read the shared inbox:

~~~bash
npm run signals -- list \
  --workspace /private/client-a --case client-a
~~~

Only **saved** checks contribute metric signals. They have
\`metric_spend_increase\`, \`metric_ctr_drop\` or
\`metric_conversion_rate_drop\` types, separate case-specific IDs,
rule version, campaign reference and underlying numeric evidence.
Acknowledge them using the existing
\`npm run signals -- ack ... --id SIGNAL_ID\`, which means *seen*, not
*resolved*. Saved checks/acks survive CLI restarts and are included in
encrypted workspace backups under \`tasks/\`.

Read-only \`yaai_signals\` in a compatible Harness and the isolated
loopback VPS staging \`GET /v1/signals\` automatically surface the saved
signals. The VPS route remains a metadata-only, Bearer-protected API.
Neither interface can evaluate/save a new check, acknowledge it or
trigger paid campaign changes.

## Safety, limitations and future work

- No Yandex/Google/Telegram requests, live polling or task scheduler.
- No advertising mutations, auto-pauses, alarm delivery or fraud claims.
- Raw account data are not copied into externally delivered messages;
  local case-authorized users can inspect numeric evidence in CLI/MCP.
- Files over 128 KiB or symlinked files/folders are rejected. The
  first-stage store is limited to 100 saved checks per client case.
- The underlying signal inbox remains bounded by its own limit and
  refuses oversized histories rather than silently losing alerts.
- This first version evaluates **one campaign per imported JSON**,
  consecutive weeks and RUB only; currency normalization, goal
  deduplication, attribution-window metadata and multi-campaign imports
  are later milestones.
- Rules are versioned as \`ad-metrics-weekly-v1\`. Threshold changes
  require new versioned reports/tests. Never rewrite old evidence.

Next: a documented, source-specific import validator for Yandex
Direct/Metrica, versioned campaign evidence and human QA. Only then
consider a stronger anomaly detector, scheduled read-only polling or
Telegram delivery. Real VPS deployment testing remains deferred.
