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
- The Wordstat and SERP scripts currently write their files at the *end*
  of each stage. Failure halfway through one of these stages may require
  redoing its requests, but **never without renewed explicit approval**.
- Jev writes completed per-item decisions during the stage, so an uploaded
  checkpoint may avoid repeated Jev calls. A response not yet checkpointed
  cannot be recovered.
- No cross-run deduplication occurs without `resume_run_id`.
- A restored finished report remains the output of that original
  research, including historical model costs. It is not a new measurement.

Local offline test: `node scripts/pain-pilot-resume-selftest.mjs`.
Normal repository CI runs this test automatically. **No live providers are
called in CI.**
