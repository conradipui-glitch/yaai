# yaai — reusable SEO research engine

`yaai` is a client-neutral engine. Client cases, presets, planner profiles, result files and dated snapshots live in external project workspaces.

The engine provides:

- Yandex Wordstat batch collection;
- Yandex Webmaster query-to-URL exports and overlap analysis (OAuth, independent from Wordstat credentials);
- intent clustering and query classification;
- Commercial / Informational / Noise / Unmapped labels;
- Landing / Guide / Hold recommendations and Page Planner;
- dated snapshots and comparisons between runs;
- a small local web UI.

For Webmaster access, export commands, costs, GitHub Actions and private CSV analysis, read **[docs/webmaster.md](docs/webmaster.md)**. The presence of a Yandex Cloud API key or cloud balance does not establish access to Webmaster's OAuth-protected reports or its separate extended tariff.

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

Wordstat reads Yandex Cloud credentials from the environment:

```text
YANDEX_API_KEY=...
YANDEX_FOLDER_ID=...
```

Legacy aliases `YAIS_API` and `YAIS_FOLDER_ID` remain supported. Webmaster separately reads `YANDEX_WEBMASTER_OAUTH_TOKEN` (alternatives: `YANDEX_WEBMASTER_TOKEN`, `YANDEX_OAUTH_TOKEN`). Secrets belong in the environment or GitHub Secrets, never in committed client data, scripts, logs or issue threads.

## Local UI

```bash
npm start -- --workspace ../my-project/research/yaai
```

Open `http://127.0.0.1:8787`. Presets and planner profiles are loaded from the selected workspace. There is no built-in client default.

## Validation

```bash
npm run check
```

CI runs syntax checks and neutral end-to-end tests using `examples/workspace/`, along with mock Webmaster API calls and synthetic query-URL CSV. No real client case, OAuth secret or paid export is needed for CI.
