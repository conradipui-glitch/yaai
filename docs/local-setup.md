# YA AI — Local / Harness-first setup (Stage 2A)

YA AI is a self-hostable **research engine**, not necessarily an AI chat.
There are two compatible ways to use one installation:

- **Local**: start the existing local web interface or run deterministic
  CLI/MCP tools against a private project workspace.
- **Harness-first**: connect the same private workspace to a compatible
  third-party Harness using its **read-only local stdio MCP** adapter.
  The Harness can supply the generative LLM; YA AI **does not need another
  main LLM API key** just to inspect saved evidence.

This setup is **not** a VPS deployment, Telegram bot, provider-API connector,
authenticated remote service, or full campaign automation.

## Requirements

Node.js **20+**, npm and a local copy of the engine. A cloned repository
is enough if its runtime dependencies are installed (usually `npm ci`,
which itself can download dependencies from npm). The setup command below
uses only the Node standard library and makes **no API/network request**.

Run from the engine checkout:

~~~bash
npm run setup
~~~

This opens a Russian-language guided prompt in an interactive terminal.
For unattended use or automated Harness setup, supply explicit flags
instead of prompting:

~~~bash
npm run setup -- --dry-run \
  --mode harness \
  --workspace /private/projects/client-a/yaai \
  --case client-a-seo \
  --prefix client-a \
  --name "Client A SEO"
~~~

Review the plan; then **explicitly** request creation:

~~~bash
npm run setup -- \
  --mode harness \
  --workspace /private/projects/client-a/yaai \
  --case client-a-seo \
  --prefix client-a \
  --name "Client A SEO"
~~~

The workspace must be **outside** the YA AI engine Git checkout. On
Windows use your own private path, e.g.
`C:\Users\<account>\Documents\yaai-projects\client-a`. JSON uses native
absolute paths and works with Windows path separators.

## What the wizard actually creates

~~~text
private-client-workspace/
  cases/client-a-seo.json
  presets/client-a.json
  planners/client-a.json
  results/
  snapshots/
  inputs/
  tasks/
  integrations/
    mcp.local.json    # only in Harness-first mode
~~~

The case is registered with **blank seeds and regions**. The preset has
no intents or negative keywords, the planner has no target pages.
These are **safe empty templates**, not fabricated SEO research.
You need to configure the client-specific sources and targeting before
real collection or page recommendations can be meaningful.

Existing files are never overwritten. Re-running setup is **idempotent**:
if existing configurations match their case ID/prefix and required schema,
the wizard reuses them, preserving your edits. If an existing config is
invalid or the generic MCP file points at another workspace or executable,
setup stops rather than silently replacing it.

The wizard rejects a workspace inside the engine repository, a filesystem
root, symlinked path segments, conflicting case result prefixes, invalid IDs
or corrupted project configuration. Files are private to the local OS user
on POSIX systems (mode 0600 for newly created files); Windows users should
also protect the workspace with appropriate Windows file permissions.

## Harness-first: connect the existing MCP

The private file `integrations/mcp.local.json` contains a **generic** MCP
stdio client config with:

- Node executable path detected at setup;
- absolute path to `mcp-server.mjs` in this checkout;
- `--workspace` and `--case` arguments pointing at this private case.

Example *shape* (paths vary):

~~~json
{
  "mcpServers": {
    "yaai": {
      "command": "/path/to/node",
      "args": [
        "/path/to/engine/mcp-server.mjs",
        "--workspace",
        "/private/projects/client-a/yaai",
        "--case",
        "client-a-seo"
      ]
    }
  }
}
~~~

Copy/adapt this **one server entry** to the MCP configuration format of
your chosen Harness. No universal auto-registration is claimed: every
MCP client has its own settings and security model.

Then ask the agent to inspect the project through
`yaai_workspace_overview`. Saved task status is available read-only
via `yaai_tasks` / `yaai_task_detail`. The MCP does not invoke paid
Wordstat, Search API, Jev, changes to ads or a background worker.

You may also point the Harness at the repository Agent Skill
`.agents/skills/yaai-setup/SKILL.md`. It explains the same review-first
installation flow. The skill is documentation, not a second executable
installer.

## Read-only diagnostics

~~~bash
npm run setup -- --check \
  --mode harness --workspace /private/projects/client-a/yaai \
  --case client-a-seo --prefix client-a
~~~

This checks local Node support, private directories, case/preset/planner
structure and (in Harness mode) the MCP server config. It does **not**
test network access, verify credentials or check whether Jev/Wordstat
accounts have funds. An incomplete installation returns a nonzero exit
code and does not write files.

In Local mode you may then run the existing server:

~~~bash
npm start -- --workspace /private/projects/client-a/yaai
~~~

It binds to `127.0.0.1`; do **not** publish it to the internet. New
workspaces start with no collected Wordstat evidence, so some existing
analysis features naturally have no result until you import/collect
appropriate data.

## Provider selection after setup (Stage 2B)

YA AI now has a provider-aware **generic Jev evaluator**: its existing
OpenRouter transport and the official direct TypeSafe System One
transport use independent credentials. The setup wizard itself still
does not request or store these credentials. See
[provider profiles and read-only diagnostic](jev-providers.md).
`npm run jev:provider -- --provider typesafe` checks only configuration:
it cannot prove a key works, an account has quota, or a model has a
particular price.

## Provider/API configuration is a separate milestone

No secret values are requested, echoed, persisted to the workspace,
embedded in MCP configuration or committed to the engine. Do not paste
OpenRouter, TypeSafe, Yandex or Google API credentials into chat,
command-line arguments, URLs or GitHub Actions logs.

The generic Jev evaluator now supports both **OpenRouter Decisions** and
**direct TypeSafe System One** with separately verified request formats.
Other specialized workflows may still be OpenRouter-only; a URL swap is
never a safe substitute for an adapter and its tests.

Stage 2B provides a secret-free offline provider diagnostic and isolated
environment variable names; it does **not** provide a key vault or live
account/price check. Live validation and additional integrations remain
separate, explicitly authorized tasks.

## Acceptance criteria

Offline tests cover fresh Local/Harness setup, dry-run and doctor,
idempotence (including edited project data), conflicting client prefixes,
repository/symlink rejection, private-file permissions and the existing
MCP workspace overview / task registry. No paid or live provider request
is part of the suite.

Commands:
~~~bash
npm run setup:selftest
npm run check
~~~

See the [delivery plan](yaai-delivery-plan.md), [MCP](mcp.md),
[task registry](task-registry.md) and [Agent Skills](agent-skills.md).
