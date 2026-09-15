# yaai — reusable Wordstat research engine

`yaai` is the engine only. Client cases, presets, planner profiles, result files and dated snapshots live in an external project workspace.

The engine provides:

- Yandex Wordstat batch collection;
- intent clustering and query classification;
- Commercial / Informational / Noise / Unmapped labels;
- Landing / Guide / Hold recommendations;
- Page Planner;
- dated snapshots and comparisons between runs;
- a small local web UI.

## Workspace boundary

A workspace is any directory with this structure:

```text
workspace/
  cases/
    <case-id>.json
  presets/
    <result-prefix>.json
  planners/
    <result-prefix>.json
  results/
  snapshots/
    <case-id>/
```
The repository contains only `examples/workspace/`, a neutral fixture used for documentation and self-tests. Real client data must not be committed to the engine repository.

## Selecting a workspace

Use either a CLI flag or an environment variable:

```bash
node server.mjs --workspace ../my-project/research/yaai
YAAI_WORKSPACE=../my-project/research/yaai node server.mjs
```

Batch scripts use the same workspace resolver. A case is selected explicitly:

```bash
node scripts/batch.mjs --workspace ../my-project/research/yaai --case my-project-seo
node scripts/build-page-plan.mjs --workspace ../my-project/research/yaai --case my-project-seo
node scripts/snapshot-results.mjs --workspace ../my-project/research/yaai --case my-project-seo
node scripts/compare-snapshots.mjs --workspace ../my-project/research/yaai --case my-project-seo
```

Equivalent environment variables are `YAAI_WORKSPACE` and `CASE_ID` / `YAAI_CASE_ID`.

For an unusual layout, only the case configuration directory can be overridden separately with `--case-root` or `YAAI_CASE_ROOT`. Presets, planners, results and snapshots continue to resolve from the workspace root.
## Case contract

`cases/<case-id>.json` controls collection and names the result prefix:

```json
{
  "id": "example-seo",
  "name": "Example SEO case",
  "resultPrefix": "example",
  "regions": ["Example Region"],
  "devices": ["DEVICE_ALL"],
  "numPhrases": 100,
  "seeds": ["buy widget", "how to choose widget"]
}
```

The engine then loads:

- `presets/example.json` for intent/query classification;
- `planners/example.json` for page targets and Page Planner settings;
- `results/example-*-latest.*` for current run outputs;
- `snapshots/example-seo/...` for dated history and comparisons.

The result prefix is deliberately independent from the case id so a project can keep stable output filenames while changing case variants.
## Credentials

The engine reads Yandex credentials from environment variables:

```text
YANDEX_API_KEY=...
YANDEX_FOLDER_ID=...
```

Legacy aliases `YAIS_API` and `YAIS_FOLDER_ID` remain supported. Secrets belong in the project/repository that runs the client workflow, not in `yaai`.

## Local UI

```bash
npm start -- --workspace ../my-project/research/yaai
```

Open `http://127.0.0.1:8787`. Presets and planner profiles are loaded from the selected workspace. There is no built-in client default.

## Validation

```bash
npm run check
```

CI runs syntax checks plus a neutral end-to-end self-test against `examples/workspace/`. The self-test verifies external workspace resolution, intent classification, query actions and Page Planner without depending on any real client case.
