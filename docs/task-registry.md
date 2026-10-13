# YA AI task registry v1 — drafts and verified saved results (no execution)

The first headless-first foundation links a persisted **request to do work**
with a case in a private workspace. It can be written by CLI and read by
MCP; it is independent from the presence of an optional general-purpose LLM.

## Current scope

- One immutable JSON per draft in `<workspace>/tasks/task-UUID.json`.
- Each includes opaque ID, case ID, task kind, short title, description,
  initial event, creation timestamp and safety policy.
- Supported states for this stage are **`draft`** and **`result_linked`**.
  Neither state starts a job, calls Jev/Yandex, marks execution, authorizes
  spending or assigns work to a worker. `result_linked` means an EXISTING
  saved JSON result was attached and integrity-checked.
- Files are created with owner-only permission on supported filesystems,
  appear atomically and are not automatically uploaded to GitHub.
- CLI can create/list/read/link a saved result. MCP is **read-only**
  (`yaai_tasks` and `yaai_task_detail`); it cannot create jobs or execute scripts.

## Example

Create a private workspace and a case using the existing YA AI case
contract. For an existing configured case called `demo-seo`:

~~~bash
npm run task -- create \
  --workspace /private/client-a/yaai \
  --case demo-seo \
  --kind research \
  --title "Проверить сохранённые запросы"
~~~

The JSON response includes a new ID such as
`task-00000000-0000-4000-8000-000000000001`. This is illustrative,
not a real registered task.

~~~bash
npm run task -- list \
  --workspace /private/client-a/yaai \
  --case demo-seo
npm run task -- show \
  --workspace /private/client-a/yaai \
  --id task-00000000-0000-4000-8000-000000000001
~~~

Valid kinds: `research`, `evaluation`, `report`, `export`. These categorize
intent only: not every kind has an executor. The case must already exist
in `workspace/cases/<case-id>.json`, with a matching ID.

If using a Harness: start the existing stdio MCP server against the **same**
workspace and ask it to call `yaai_tasks` or `yaai_task_detail`. The result
matches the CLI record; the Harness does not gain write access from this
feature. The registry is not a remote server.

## Link an existing result — Stage 1B

After a previous research flow has **already completed** and saved a JSON
file under the same workspace's `results/` (for example
`results/demo-wordstat-latest.json`), attach it to the task **without
re-running the research**:

~~~bash
npm run task -- link \
  --workspace /private/client-a/yaai \
  --id task-00000000-0000-4000-8000-000000000001 \
  --relative-json results/demo-wordstat-latest.json
~~~

Use the actual ID returned by `task create`. If the case has
`resultPrefix: "demo"`, file names in `results/` must begin with
`demo-`; a snapshot may also be selected under
`snapshots/<case-id>/...`. Links to other client cases, source symlinks,
unparseable JSON or sources over 5 MiB are rejected.

The operation creates one **immutable event file** in `tasks/links/`;
the original draft JSON is never rewritten. It records source path,
full-file SHA-256, file size, reported source type and generation date.
When the result has a supported **measured** USD cost field, that
measured value and its original JSON field are included. Missing costs
remain **null**, never silently reported as zero.

A task can be linked to **one** result in this version. Repeating the
`link` command will not replace its event. Future run history needs
its own migration and contract: no running job or complete state is
inferred from the presence of a previous output.

`task show`, `task list`, `yaai_task_detail` and `yaai_tasks`
derive a `result_linked` view from this event; they check the saved
source hash every time. If that file changes or disappears, inspection
fails rather than presenting stale, unverifiable evidence. Restoring
the original source restores the read-only view. Back up both files.

## Safety & limits

- Explicit workspace is **required** for the CLI. There is no implicit
  fallback to the public engine repository.
- Each workspace stores its own drafts. MCP users see only the workspace
  to which the MCP process is connected. The task ID cannot escape the
  registry directory; symlink task dirs and corrupt records are rejected.
- No credentials or raw research content should appear in titles or
  descriptions. The registry is still private local data.
- This stage does not provide RBAC, login, scheduling, retries, job-completion
  claims, independent billing records, execution or safe remote hosting.
- `server.mjs` remains a local tool and must **not be publicly exposed**
  without an authenticated deployment boundary.
- Back up the workspace directory. This is not yet a database or
  transactional multi-host queue.

## Acceptance and next step

Offline automated tests create a draft, reload it from a fresh CLI
process, read it from MCP, assert project/workspace separation, reject
invalid IDs and manipulated records, and verify no paid calls or external
writes were authorized.

Stage 1B links a previously saved JSON artifact through one immutable
`artifact_linked` event and displays its metadata to CLI and MCP. This
passes offline synthetic/fixture tests; it does not prove all existing
real client results are valid. Next: introduce **explicit authorized
execution** for one selected existing workflow, with budget gates and
recoverable run events.

See [delivery plan](yaai-delivery-plan.md).

## Stage 1C — explicit offline runs

The shared registry now also exposes actual *offline* Webmaster overlap runs.
Their status appears in the same CLI and read-only MCP task views, separately
from Stage 1B's **previously saved** result links. Start/end events, attempts,
failed or interrupted runs and manual recovery are documented in
[offline task execution](task-offline-execution.md). No API/agent worker exists yet.
