# Recover a GitHub Actions Pain Quality research run

Scope: **only** the existing **Pain Quality real-data pilot** workflow. This is
not yet a generic workflow manager; other research jobs are unchanged.

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
