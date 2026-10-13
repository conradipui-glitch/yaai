# YA AI task registry v1 — drafts, not execution

The first headless-first foundation links a persisted **request to do work**
with a case in a private workspace. It can be written by CLI and read by
MCP; it is independent from the presence of an optional general-purpose LLM.

## Current scope

- One immutable JSON per draft in `<workspace>/tasks/task-UUID.json`.
- Each includes opaque ID, case ID, task kind, short title, description,
  initial event, creation timestamp and safety policy.
- The sole supported status is **`draft`**. Creating a record does **not**
  start a job, call Jev/Yandex, mark completion, reserve a budget, authorize
  a spend, or assign work to any worker.
- Files are created with owner-only permission on supported filesystems,
  appear atomically and are not automatically uploaded to GitHub.
- CLI creates/list/reads. MCP is **read-only** (`yaai_tasks` and
  `yaai_task_detail`); it cannot create jobs or execute scripts.

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

## Safety & limits

- Explicit workspace is **required** for the CLI. There is no implicit
  fallback to the public engine repository.
- Each workspace stores its own drafts. MCP users see only the workspace
  to which the MCP process is connected. The task ID cannot escape the
  registry directory; symlink task dirs and corrupt records are rejected.
- No credentials or raw research content should appear in titles or
  descriptions. The registry is still private local data.
- This stage does not provide RBAC, login, scheduling, retries, completion
  events, billing records, result linkage, or safe remote hosting.
- `server.mjs` remains a local tool and must **not be publicly exposed**
  without an authenticated deployment boundary.
- Back up the workspace directory. This is not yet a database or
  transactional multi-host queue.

## Acceptance and next step

Offline automated tests create a draft, reload it from a fresh CLI
process, read it from MCP, assert project/workspace separation, reject
invalid IDs and manipulated records, and verify no paid calls or external
writes were authorized.

Next (Stage 1B): extend these drafts with a tested, append-only event/
outcome contract and link **one already saved** real research artifact to
the task. Only then decide how authorization and actual execution should
work.

See [delivery plan](yaai-delivery-plan.md).
