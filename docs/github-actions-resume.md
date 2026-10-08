# Recover paid research in GitHub Actions

Scope: **Pain Quality real-data pilot**, **Omsk construction Pain Discovery**, **Omsk Jev reclassification**, and **Pain Quality relevance-controlled pilot**. Each uses narrowly scoped artifact recovery; this is **not** a general workflow manager. One-off live smoke tests remain intentionally fresh and manual.

## Start a fresh study

GitHub → Actions → **Pain Quality real-data pilot** → Run workflow:

- Leave `resume_run_id` empty.
- Set `confirm_paid_requests=true` to permit the existing, bounded paid
  collection/evaluation stages (Wordstat, Search API, Jev).
- Review current provider prices before authorizing a run.

With `confirm_paid_requests=false`, a fresh run **fails closed** before
making API calls. No background run or retry is scheduled.

## Continue a previously started study

1. Open the prior run and copy its numeric GitHub Actions run ID.
2. Start the same **Pain Quality real-data pilot** workflow manually.
3. Set `resume_run_id` to the previous run ID.
4. **First try** with `confirm_paid_requests=false`. This reuses all
   successfully saved paid results and performs any pending *offline* tasks.
   It fails before any API request if a paid stage is still missing.
5. Only when you want to pay for the **missing** stage(s), rerun with
   `confirm_paid_requests=true`. Previously completed Wordstat/SERP
   collection stages are skipped. Saved Jev per-item checkpoints are reused
   if their item, state, metadata, profile and requested model still match.

The workflow downloads the named artifact
`pain-quality-real-pilot-2026-10-08` from the selected earlier run into
`pilot/`, with no separate installation or manual copying of JSON files.

The archive includes a scenario manifest, Wordstat evidence, a saved search
query plan, SERP results, Jev per-decision checkpoints, available reports
and the offline review queue. A recovery refuses incompatible settings,
missing manifests, malformed/partial completed stages or stage-order gaps
rather than risking another paid request against mismatched input. **Old
artifacts created before this feature have no manifest and cannot be
automatically resumed.** Do not add a synthetic manifest to old files.

## What is retained, and the limits

The workflow uploads available results **even if a processing step fails**
(via `if: always()`). Artifacts are kept for **7 days** and may contain
customer, source and query data: limit repository access appropriately and
download/store private copies if longer retention is necessary.

- This is best-effort: a cancelled/force-terminated runner, artifact upload
  failure or expired artifact can prevent recovery.
- Wordstat now saves each successful seed response, and SERP saves each
  successful query response. They both produce `<output>.yandex-checkpoints/`
  containing a strict batch manifest and atomic result records. A failure
  midway through a stage no longer forces the **saved** requests to repeat.
- Saved Yandex responses are reused only if the entire batch signature
  (queries/seeds, region, folder and collection settings) matches. Missing
  responses still require explicit `confirm_paid_requests=true` to call Yandex.
- Jev likewise writes each completed decision. A provider response not yet
  written to a checkpoint cannot be recovered.
- A failed stage (even if **all** its individual responses are checkpointed)
  is still considered pending by the pilot safety gate. You must explicitly
  approve attempting that paid-capable stage; its matching saved responses
  will be reused without additional charges.
- No cross-run deduplication occurs without `resume_run_id`.
- A restored finished report remains the output of that original
  research, including historical model costs. It is not a new measurement.

Local offline test: `node scripts/pain-pilot-resume-selftest.mjs`.
Normal repository CI runs this test automatically. **No live providers are
called in CI.**

## Local checkpoint directories for Yandex collectors

```bash
node scripts/pain-wordstat.mjs --seeds "term one,term two" --region 225 \
  --out /private/wordstat.json --execute

node scripts/serp-collect.mjs --queries "query one,query two" --region 225 \
  --out /private/serp.json --execute
```

If interrupted, repeat the same command with the same output path. Each CLI
prints **new** and **reused** request counts after a successful run. You may
choose `--checkpoint-dir /private/specific-saved-directory` on both runs
instead of the default `<out>.yandex-checkpoints/`.

**Do not commit** the checkpoint directory: it can contain private search
results. Both checkpoint kinds are excluded by `.gitignore`. Do not
run multiple collectors concurrently against the same directory, change
the saved manifest, or manually splice data from unrelated runs. Unknown
Wordstat counts stay unknown; the collector retains the original
non-additive demand semantics.

The new offline regression command `node scripts/yandex-checkpoints-selftest.mjs`
simulates two provider outages, reruns both collectors with mock transports,
and ensures only missing requests are issued. No real API keys are used.

## Omsk construction pilot: roofing, screed, facades

GitHub → Actions → **Omsk construction Pain Discovery pilot** → Run workflow.

- New research: leave `resume_run_id` empty and set
  `confirm_paid_requests=true` after reviewing the bounded call plan.
  The workflow runs three independent, topic-scoped cases: roofing,
  screed and facades, each limited to two Wordstat seed requests,
  two Yandex SERP requests and at most eight Jev decisions.
- Retry: take the numerical run ID from the previous execution and set
  `resume_run_id` to it. Each matrix case restores its own artifact:
  `omsk-pain-roofing`, `omsk-pain-screed` or `omsk-pain-facades`.
  Previously completed stages are validated and skipped; per-request
  Wordstat, SERP and Jev checkpoints may resume an interrupted stage.
- Approval: `confirm_paid_requests=false` **never** sends paid calls.
  If an unfinished stage could send paid requests, the entire case stops
  before any stage is executed. To allow only the missing paid-capable
  stages, rerun with `confirm_paid_requests=true`. Cached responses still
  do not generate new API requests.
- A case that already has every valid stage can be rerun without
  authorizing paid calls; it will reuse the stored report.

Each case has its **own** validated manifest, which binds the case,
parameters, Jev profile and selected model, and the relevant research
code. It prevents accidental mixing of Omsk topics, regions and
configuration across artifact downloads. Saved data from older runs
without this manifest cannot be automatically recovered.

Each run uploads results **even when the job fails**, with 7-day
artifact retention. This is best-effort: cancellation before upload,
unavailable artifacts and responses not yet saved to disk cannot be
recovered. The old live "verify region" prerequisite has been removed
from the recovery path to avoid a new API probe before checking and
reusing already collected evidence. The regional ID remains explicitly
pinned to `11318`. A live provider-region audit, when desired, is a
separate paid/authorized diagnostic.

Data stored in Actions artifacts can be accessible to people with
repository/run permissions. Avoid putting confidential client data in
public repository research jobs; never upload API keys or sessions.

Offline safety tests:
```bash
node scripts/omsk-pain-resume-selftest.mjs
node scripts/workflow-budget-selftest.mjs
```

## Resume previously collected data with Jev (no new Yandex calls)

Two additional **manual-only** workflows can reuse previous Yandex evidence and
continue Jev assessments without repeating decisions that were saved before a
crash:

| Workflow | Original source run | Previous Jev run | Max Jev decisions |
| --- | --- | --- | --- |
| **Reclassify cached Omsk search demand and SERP with Jev** | `source_run_id` referencing `omsk-pain-roofing`, `omsk-pain-screed`, `omsk-pain-facades` | Optional `resume_run_id`, same reclassification workflow | 8 per topic |
| **Pain Quality relevance-controlled pilot** | `source_run_id` referencing `pain-quality-real-pilot-2026-10-08` | Optional `resume_run_id`, same relevance workflow | 90 |

Both workflows preserve the original source artifact separately from the
assessment outputs. **No Wordstat or Yandex Search API requests** are made by
either workflow. A saved Jev checkpoint may prevent repeating an already
evaluated source observation.

To run either workflow in GitHub Actions:

1. Provide `source_run_id` from the original research. Historical run IDs
   are provided as defaults only for convenience; these older artifacts can
   expire. If unavailable, obtain a valid run with the required evidence.
2. Leave `resume_run_id` blank for new assessment, or set it to an earlier
   execution of the **same** assessment workflow to continue its outputs.
3. `confirm_paid_requests=false` (default) never invokes Jev. A run with
   an unfinished Jev stage exits **before processing or spending**.
4. Set `confirm_paid_requests=true` only when you agree to the remaining
   Jev calls. Already completed work is inspected and skipped; valid
   per-observation Jev checkpoints are reused.

Source and output data must match the verified scenario manifest. It binds
the selected Omsk case or relevance filter, a digest of original source data,
requested Jev model, evaluation profile and analysis code. If any change,
the run stops before paid evaluation instead of mixing evidence.

For relevance-controlled review, the topic filter is deterministic and
requires at least **five relevant queries** and **50 SERP result excerpts**
before running Jev. The blind review remains unlabeled; reported quality
statistics are not claimed to be verified until a human labels the source
excerpts.

The corresponding artifacts are uploaded even when a stage fails, including
any per-item Jev checkpoints:

- `omsk-reclassified-{roofing,screed,facades}`
- `pain-quality-relevant-real-sample-2026-10-08`

Artifacts are retained for **7 days**. A force-cancelled runner, expired
artifact, provider response before checkpoint creation, or an incomplete
multi-file final report may still require manual recovery. Legacy
reclassification artifacts without a manifest cannot be automatically
trusted or resumed. Never reconstruct a missing manifest by hand.

Offline tests: `node scripts/cached-jev-pilots-selftest.mjs` and
`node scripts/workflow-budget-selftest.mjs`.
