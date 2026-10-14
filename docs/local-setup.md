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
    jev.client-a-seo.json # model/provider and env variable NAME only
    mcp.client-a-seo.local.json  # Harness-first, per case
~~~

The case is registered with **blank seeds and regions**. The preset has
no intents or negative keywords, the planner has no target pages.
These are **safe empty templates**, not fabricated SEO research.
You need to configure the client-specific sources and targeting before
real collection or page recommendations can be meaningful.

Each case gets a separate MCP connector file. Existing legacy
`integrations/mcp.local.json` files remain untouched, so current Harness
connections keep working. The new per-case file can be selected in the
Harness when the user is ready. It is never silently installed into a client.

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

The private file `integrations/mcp.<case-id>.local.json` contains a **generic** MCP
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

## Choose a Jev provider during setup — Stage 2C

The wizard now prompts in Russian for a Jev provider, after the project
name and result prefix. The choice is **per case**, not shared globally.
In noninteractive mode:

~~~bash
npm run setup -- \
  --mode harness \
  --workspace /private/projects/client-a/yaai \
  --case client-a-seo \
  --prefix client-a \
  --jev-provider typesafe
~~~

Optional flags: `--jev-model jev-1.13.0` and
`--jev-key-env TYPESAFE_API_KEY`. The latter is the **name of an
environment variable**, NOT its value; only verified variable names
belonging to the selected provider are accepted.

Each case gets a private `integrations/jev.<case-id>.json` containing
only case ID, provider, model, and allowed environment key **name**.
Neither the key nor the model account balance is stored there.
You can keep `typesafe` for client A and `openrouter` for client B
in the same workspace. Re-running the installer preserves existing
selection and other project files. A conflicting requested provider,
model, or key variable stops with an error: it is not silently rewritten.

~~~bash
npm run setup -- --check \
  --mode harness --workspace /private/projects/client-a/yaai \
  --case client-a-seo --prefix client-a

npm run jev:provider -- \
  --workspace /private/projects/client-a/yaai --case client-a-seo
~~~

`--check` confirms local file integrity and shows whether the *selected
environment variable is present*. **No network access is performed,
and a present key does not prove authorization, quota or pricing.**
Missing credentials do not prevent using offline YA AI or Harness MCP
for reading existing data.

The **generic** Jev evaluator can use this saved selection:

~~~bash
npm run jev:evaluate -- \
  --workspace /private/projects/client-a/yaai --case client-a-seo \
  --input /private/terms.json \
  --profile examples/evaluation-profiles/search-term-triage.json \
  --out /private/terms-evaluated.json \
  --execute
~~~

`--execute` is a separate explicit permission to incur potential model
charges. Inspect the batch and chosen provider before running it.
If `--provider` or `--model` is also passed and contradicts the saved
selection, YA AI refuses the run. Previously configured environment
defaults continue to work when **no project** is selected.

**Important:** this profile does not automatically scope arbitrary
input/output file paths to a client. Keep all evidence under your
private project directories; true cross-project access control is a
future auth/storage milestone. The wizard is not a key vault or a
provider switch/migration tool yet. Changing an existing provider
requires a separately planned explicit migration, not deleting
files blindly.

## Provider selection after setup (Stage 2B)

YA AI now has a provider-aware **generic Jev evaluator**: its existing
OpenRouter transport and the official direct TypeSafe System One
transport use independent credentials. The setup wizard itself still
does not request or store these credentials. See
[provider profiles and read-only diagnostic](jev-providers.md).
`npm run jev:provider -- --provider typesafe` checks only configuration:
it cannot prove a key works, an account has quota, or a model has a
particular price.

## Using the API key without saving it — Stage 2D

After choosing Jev in the wizard, you may provide a key once in a
trusted local terminal with `jev:evaluate --prompt-key --execute`.
The prompt hides typed characters and does **not** write a secret to
the project. Without a local TTY, use an operating system / Harness
secret manager to inject the selected provider's environment variable.
The wizard and read-only diagnostics remain free and secret-free.

`npm run jev:provider -- --workspace WORKSPACE --case CASE`
and `npm run setup -- --check ...` now distinguish locally available
capabilities from **unimplemented VPS/MCP/Telegram integrations**.
A local provider key is not proof of quota, pricing or live access.
[Full guide and VPS readiness](credential-delivery-and-vps-readiness.md).

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
