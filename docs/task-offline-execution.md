# One-off offline task execution — Stage 1C

YA AI's first executable job is deliberately **narrow**: analyzing an already
downloaded Yandex Webmaster CSV for overlapping search queries/pages, using
the repository's existing `lib/webmaster-overlap.mjs`. It **does not**
fetch data, contact Yandex, Jev or an LLM, mutate ads, run arbitrary shell
commands, start a worker, or schedule future jobs.

## Prepare

Use an explicitly selected, locally stored private workspace with an
existing case `demo` whose case JSON includes `resultPrefix: "demo"`.

Put a previously exported Webmaster CSV at:

```text
PRIVATE_WORKSPACE/
  cases/demo.json
  inputs/demo/webmaster.csv
  tasks/
  results/
```

The source CSV must be a normal file of at most 3 MiB and the input folder
and workspace must not be symlinks. The runner does not download this
file and does not ask for credentials.

Create a **research** task (the existing Stage 1A command):

```bash
npm run task -- create --workspace PRIVATE_WORKSPACE \
  --case demo --kind research --title "Check query overlap offline"
```

Save its generated `task-...` ID. Then request the actual run:

```bash
npm run task -- run --workspace PRIVATE_WORKSPACE --id TASK_ID
```

The only permitted task executor in v1 is `webmaster-overlap`, selected
internally: users cannot pass arbitrary script names or shell commands.

## Status, results and restart

`task show --workspace PRIVATE_WORKSPACE --id TASK_ID` shows the source
task, observed run status, attempt count and an output file path under
`results/demo-webmaster-overlap-TASK_ID-a1.json`.

Meaning of the states:

| State | Meaning |
| --- | --- |
| `draft` | Saved work request, not started |
| `running` | An attempt was started and its owner process is still alive |
| `succeeded` | Analysis produced JSON and its output fingerprint matches |
| `failed` | Attempt ended with a recorded safe error code; inspect input and retry explicitly |
| `interrupted` | Attempt has a start event but no end event, possibly after process termination |
| `result_linked` | Stage 1B: external **previously saved** result attached, not executed here |

Each attempt has separate start/end events under
`tasks/executions/TASK_ID/`, and its own result path. Completed outputs
are never overwritten; the SHA-256 is verified on subsequent inspection.
An `interrupted` attempt is not silently reinterpreted as success even
if a partial output exists.

For a failed or interrupted attempt, after fixing the source, use:

```bash
npm run task -- retry --workspace PRIVATE_WORKSPACE --id TASK_ID
```

After a process crash, its `.lock` directory may remain. Only on
the **same host**, with evidence that its previous PID no longer exists,
explicitly unlock it via:

```bash
npm run task -- recover --workspace PRIVATE_WORKSPACE --id TASK_ID
npm run task -- retry --workspace PRIVATE_WORKSPACE --id TASK_ID
```

A still-running process cannot be recovered/unlocked. If ownership is
unknown or the lock was only partially written, recovery refuses to
guess; investigate manually. This is **single-host local execution**,
not yet a distributed lease manager. At most three attempts per task
are allowed. An already successful task or task with a Stage 1B
pre-existing linked result cannot be rerun via this executor.

### CLI and MCP have different permissions

CLI explicitly creates/links/runs/retries. The existing MCP tools
`yaai_tasks` and `yaai_task_detail` expose identical persisted task
status and run history **read-only**. No MCP command launches a job,
approves spending or modifies a CSV/campaign.

The runner reports its actual local operation, `0` paid API calls,
`measuredCostUsd: null` for missing pricing data, and no external
mutations. Zero API calls are established by code (pure CSV library)
and synthetic tests, **not** by connecting to a real Yandex account.

### Known limits

- No per-user authorization beyond an explicit local CLI and OS file
  permissions; do not expose CLI/server over a public interface.
- Run locking is single-host and checks an owning PID. A system with
  multiple container hosts or network filesystems needs additional
  coordination before enabling multi-worker mode.
- Source CSV may contain client data; keep workspaces out of a public
  Git checkout and back up `tasks/`, `inputs/`, and `results/`.
- This is the first **real local computation** tied to the task ID.
  It is not an agent orchestrator, billable-job queue, or subscription
  to live analytics. No auto-start on system boot.

See [overall delivery plan](yaai-delivery-plan.md) and
[task registry](task-registry.md).
