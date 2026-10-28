# YA AI — delivery plan (started 2026-10-13; product direction updated 2026-10-28)

Status: **active, staged delivery**. The [YAAI Product Blueprint v2](yaai-product-blueprint-v2.md)
now defines the user experience, shared knowledge model and **next dependency
order**. This document remains the technical history, safety contract and
record of already shipped stages; its original stage numbering is historical.
[Operator Mode](yaai-operator-service-mode.md) adds a founder-led service workflow:
public SMB diagnosis and personalized offer, followed by authorized client work.
The [first P0-B audit](yaai-p0b-skills-audit.md) reviews internal and external
skills; comparative tests are still required before calling P0-B complete.
The [Opportunity Radar design](yaai-opportunity-radar.md) expands the future
product from reactive marketing research into local-first entrepreneurial
opportunity discovery; it is **not a working market watcher**.
The earlier [Studio roadmap](yaai-studio-roadmap.md) is design history.
No deadlines, costs, target market or external access are assumed.

## Product definition and constraints

YA AI is an **independently installable research/marketing engine**, not
a chat UI. CLI, local/remote MCP, desktop/tablet web UI and Telegram bot
with an optional Mini App are **clients of the same engine**. The engine
can operate without a purchased general-purpose LLM API when an external
Harness supplies reasoning and writing through MCP + Agent Skills.
A separate LLM connection is optional for first-party chat/writing.
Jev is a **bounded decision engine**, not a prose-writing replacement.

One client project/workspace owns research evidence, tasks, review decisions,
exports, API connection references and eventually campaign logs. Separate
client workspaces must never share secrets or reports accidentally.

**Non-negotiable:** collecting new paid data, calling billable models,
publishing, changing advertising budgets/status/keywords, accessing private
accounts or other consequential mutations always require explicit scoped
authorization. Preserve evidence and cost provenance; nothing is
implicitly resumed at billable cost. Local-only workflows must not
silently expose an unauthenticated network service.

## Navigation: current iteration and completion gate

The [YAAI Quality Gates](yaai-quality-gates.md) are **mandatory** for each
iteration: verified local behavior, backward-compatible contracts, affected
cross-tool paths, reproducibility, security/budget guards and a recorded
ACCEPT/REWORK/BLOCK decision. Passing GitHub CI is necessary where code
changed, but does **not** alone establish successful user or end-to-end testing.
No move to the next step when an applicable test is missing or failed.
The [YAAI Iteration Tracker](yaai-iteration-tracker.md) is the single
source of truth for **the current named substep, next deliverable, evidence
of completion and transition**. Current stage is **P0-B**: **P0-B.3 accepted as a versioned methodology**
([QA evidence](acceptance/P0-B.3.md)); next iteration is **P0-B.4 — independently
labelled scenarios and expected decisions**. The entire P0-B stage is
not yet accepted; actual prospect research/Studio/MCP remain later steps.
The prospect → public audit → offer scenario is a *vertical use case* for
P0-B methodology and P0-C/D/E implementation, not a newly inserted phase.
Never mark all of P0-B done after just an inventory/audit.

## Current next-work sequence — ratified 2026-10-28

**Principle:** one plain-language entry point with optional "one task" or
"full marketing package", not a manual catalog of tools. Preserve the
headless-first engine, case isolation, existing CLI/MCP clients and all
previous artifact formats. Reference: [Product Blueprint v2](yaai-product-blueprint-v2.md).

1. **P0-A — architecture/UX contract:** brief, human-readable plans, project
   and chat hierarchy, evidence-knowledge-content connections (documented
   in Blueprint v2). Not a new working chat.
2. **P0-B — methodology audit:** inspect existing and external marketing,
   research, SEO, audience and Agent Skills, including trend discovery,
   source evaluation and adjacent opportunities; review instructions,
   scripts, licenses and evidence of effectiveness; benchmark one chosen
   vertical playbook; do not copy or execute unreviewed community code.
3. **P0-C — evidence-first persistence:** source profiles, snapshots,
   a minimal BusinessCapabilityProfile, observations,
   claims, replies/contradictions, timestamps and change status, with a
   *small* case-scoped real-data import and conversion into the current
   Evidence Report v1 projection. Don't turn a report into the only database.
4. **P0-D — smallest end-to-end orchestrator:** a niche brief determines
   tool/source selection; preview and permission gate; one bounded
   research run; saved results + graceful restart and reusable knowledge.
5. **P0-E — simple Studio + MCP:** project/chat entry, single prompt,
   choice of packages, visible results and source traceability. UI and
   external agent use one task/approval engine; no duplicated business code.
6. **P0-F — audience/research pack:** research findings, segmented personas
   with evidence vs illustrative details, one offline source-linked
   OpportunityCandidate (or an honest «insufficient evidence» state),
   prioritized site-content briefs and missing-data list. No unsupported
   claims or auto publishing.
7. **P1/P2:** first a read-only business briefing and on-demand trend
   comparison from comparable snapshots; then versioned SEO/GEO articles,
   reviewed site publishing, optional bounded source collection, analytics
   snapshots, pedagogical and real A/B with proper experimental design,
   VPS/Telegram and progressively expanded Skills.

### Gate for the first useful product

A novice can create a project, type a niche and objective, choose one
module or a relevant "full package", review estimated cost/unknown
costs, approve narrowly, receive **one real research-to-report run**
that persists without recollection, inspect the citations and disputed
evidence, and reuse the results in the project (also from MCP).
All real spend and external writes remain opt-in. Site publication
and true A/B experimentation are later stages, not prerequisites.

### Current implementation caveats

Already present in `main` as limited slices: light Russian local Studio,
case task read models, read-only saved Evidence Report v1 Pain Discovery
mind map (PR #64–65), first contextual Knowledge Layer, CLI/MCP,
TypeSafe provider support and offline task execution. **Not present:**
universal chat/orchestrator/consumer-friendly "one click research pack",
verified full-source review and reply tracking, an Opportunity Radar,
full-source trend discovery and a universal knowledge DB,
complete model router, safe publish, live Metrika, production VPS agent,
Telegram bot or online A/B platform. Preserve compatibility and
test each slice. The "Reality check" table below reflects the original
2026-10-13 audit and is not a fresh current inventory.

## Reality check from current main

| Capability | Existing evidence | Actual limitation |
| --- | --- | --- |
| Keyword research / Wordstat | `scripts/batch.mjs`, Wordstat and comparison scripts | API credentials/case config; per-source work not a unified scheduler |
| SERP, pain evidence, quality | `lib/pain-discovery.mjs`, relevance checks, human-review benchmark | Source quality and task-level accuracy not independently established |
| Webmaster, ranking and Page Planner | existing analyzers, `public/page-planner.js` | No combined end-to-end campaign creation |
| Jev, evaluation checkpoints, SEO tasks | `lib/jev.mjs`, `lib/evaluation.mjs`, `lib/jev-seo-workflows.mjs` | OpenRouter Decisions only; alternative provider adapter unimplemented |
| Interactive offline reporting | Pain/SEO HTML report renderers, CSV, JSON | No universal dynamic component schema/chat-to-widget renderer |
| Local interface | `server.mjs`, `public/index.html`, `public/app.js` | Primarily local; **not** an authenticated multi-client VPS web service |
| MCP + Agent Skills | `mcp-server.mjs` (stdio, read-only external), `.agents/skills/` | No remote transport/auth, job launch, approvals or task lifecycle |
| Multi-project storage | explicit workspace & case configuration | Not yet first-class client project/accounts/roles |
| VPS, Telegram, advertising automation | product concept | No authenticated deploy, worker, bot, Google Ads/Direct write automation |

This inventory refers to code paths and contracts, **not proof of
production-ready behavior**. We still need real-user acceptance testing.

## Stages (ship independently; no large speculative subsystems)

### 1. Task foundation and honest inventory — in progress

**1A. Durable request registry — completed (PR #53).** Explicit CLI creates a
`draft` task in a selected workspace, then lists/reads it. Read-only
MCP can see the same tasks and IDs. No worker, scheduler, approvals,
execution, costs, completed-run tracking or automatic mutations are
claimed here. A task is an **intention**, not an executed job.

**1B. Saved-result binding — completed (PR #54).** Explicit CLI links
one existing same-project saved JSON under `results/` or `snapshots/`.
The immutable `artifact_linked` event records file SHA-256, metadata
and measurable reported costs if present (otherwise null); CLI and
read-only MCP inspect the identical linked state. No paid work, actual
run, approval or executor was added. This is **not** a general
append-only run lifecycle or a proof of external API accuracy.

Exit for Stage 1: a real client-provided saved output still needs
acceptance testing on its own workspace. The code now supports draft
creation, read-only cross-interface inspection and immutable one-output
linkage with source-integrity checks and CLI restart tests. Stage 1
**does not** yet have executable tasks, budget authorization or a
general multi-event run lifecycle.

### 1C. First constrained offline execution — implementation in PR #55

The **existing Webmaster overlap CSV analyzer** is now available for a
locally initiated, one-off research task. Start/end events, uniquely named
outputs, tamper-detecting hashes, safe failure codes, explicit retries and
same-host stale-lock recovery are tested with synthetic CSV fixtures.
CLI may request runs; MCP can **only read** their statuses. No paid API,
arbitrary command runner, scheduler, authenticated remote worker or
campaign mutation is enabled.

This milestone does **not** finish the future paid execution contract:
credentials, provider budgets, approval tokens and resumable API tasks
need separate implementation and acceptance.

### Next: tightly scoped execution contract (before autonomous jobs)

Define actual run statuses, separate user approvals from source metadata,
and test an offline/dry-run executor for **one** already existing
research flow. Do not expose paid execution in MCP or Telegram before
policy enforcement and human verification.

### Stage 4A. First contextual Knowledge Layer module — PR #63

The existing **local** web UI includes a limited, functional Knowledge
Layer for the Stage 3C CTR and conversion-rate rules. Help triggers have
short definitions on hover/focus and accessible right-hand detail drawers
covering formula, mechanism, practical PM decisions, risk and related
terms. An editable offline two-week calculator demonstrates rate
changes without falsely claiming to run the statistical rule engine.

The accompanying CI drift gate pins the reviewed metric engine's Git
blob source hash; changing that source requires reviewing/updating
educational explanations. A backend parity fixture checks example
math. This is **not** a complete dynamic documentation platform,
auto-fresh external docs checker, Web Studio redesign or VPS UI.
[Knowledge Layer scope and developer procedure](knowledge-layer.md).

Next: add contextual help to additional real workflows, then evolve
its layout into YA AI Studio rather than building a large unused
documentation architecture.

### Stage 3C. Conservative offline campaign-metric review — PR #62

The signal inbox can now receive **saved, provenance-checked findings**
from two adjacent complete weekly periods of manually imported campaign
metrics (RUB, one campaign per source). Rules look for spend growth at
similar impression volume, CTR decline with conservative proportion
interval separation, and conversion-rate decline only after finalized
attribution and sample-size gates. A dry-run is the default; explicit
`--save` records immutable findings. Read-only MCP and the separate
loopback VPS reader inherit signal metadata without gaining any power
to run checks or change external services.

This is **not** live anomaly monitoring, authenticated Yandex/Google
report ingestion, confirmed fraud detection, causal inference or
automatic campaign protection. Further work: source-specific import
validation, user education/Knowledge Layer and eventually opt-in
notification delivery. Real VPS trials remain postponed.
[Stage 3C detailed evidence contract](weekly-metric-rules.md).

### Stage 3B. Shared observed signal inbox — PR #61

Instead of running a VPS trial immediately, Stage 3B builds a bounded
**read-only signal feed from real persisted local task events**:
`run_failed`, `run_interrupted`, `run_succeeded`, `artifact_linked`.
Signals have stable IDs across polling/restarts and explicit private
CLI acknowledgements. Both read-only MCP and the existing isolated
loopback VPS API expose case-scoped signals without source artifacts.
No new background worker, Telegram delivery, live ad monitoring,
synthetic click-fraud claims, provider calls or advertising changes
are enabled. This is a prerequisite for future inbox/Web Studio alerts.

VPS staging with live TLS, remote token rotation and backup restore
testing is **postponed** until requested; we can next implement
offline dry-run signal rules and Knowledge Layer with versioned help.
[Signal inbox docs](signal-inbox.md).

### Stage 3A. Authenticated read-only VPS staging components — PR #60

A **separate Node process**, bound to 127.0.0.1, now exposes only generic
health and Bearer-token-protected task metadata for one pinned case.
No `server.mjs` route, paid API, raw evidence download, arbitrary tool
execution, write-enabled MCP or remote task control is exposed.
A sample Caddy automatic-HTTPS reverse proxy and hardened Linux
systemd service show how an administrator *could* deploy a staging
instance; the example is not a tested remote deployment.
A limited-size **AES-256-GCM encrypted workspace backup/restore**
includes authenticated verification, restrictive source selection,
wrong-key/tamper tests and non-overwriting restore to a new directory.

The next acceptance milestone is a **real isolated staging VPS** with
DNS/TLS, reviewed firewall/service permissions, credential rotation
and a measured restore rehearsal — only after user approval and access
to such a host. This code stage does not claim production hardening,
Telegram/OAuth, remote MCP, multi-user roles or marketing mutations.
See [stage 3A guide](vps-readonly-stage.md).

### Stage 2D. Safe credential input and offline capability doctor — PR #59

The generic Jev CLI can now request an ephemeral API key with a hidden
TTY prompt (`--prompt-key --execute`) instead of persisting secrets
in case/MCP files or invoking an OS-specific vault. Noninteractive
Harness execution still relies on OS/Harness-provided environment
injection. Offline setup and provider diagnostics surface an honest
matrix of implemented and **not implemented** functions.
A [VPS security go/no-go checklist](credential-delivery-and-vps-readiness.md)
defines work that **must precede** exposing servers or remote MCP.
This milestone does not add a vault, TLS, auth, persistent VPS worker,
Telegram bot or a live provider call.

### Stage 2C. Project-scoped provider onboarding — PR #58

The Local/Harness-first installer can select OpenRouter or TypeSafe
**per client case**. It stores only provider ID, model and allowed
credential environment variable name outside the source checkout.
Offline doctor reports safe readiness; the generic Jev CLI consumes
this project profile without a custom API key in configuration.
Re-installs and conflicting CLI flags are fail-closed. This milestone
does **not** provide credential storage, a live/provider pricing test,
an authenticated SaaS deployment or universal model routing.

Next: guided setup usability and a reviewed credential-injection path
for the user's chosen environment, then single-request live validation
only with explicit cost approval; retain current no-paid-call defaults.

### Stage 2B. Provider selection — PR #57

The **generic** Jev evaluator can use existing OpenRouter Decisions or
direct TypeSafe System One with fixed documented endpoints, distinct
provider-specific environment credentials and pinned default model IDs.
Offline `jev:provider` doctor reports configuration and key presence
without requesting or logging secrets. Provider-aware checkpoint
fingerprints prevent cross-provider cache contamination; missing
USD costs remain unknown. No live credential, billing or tariff tests
have been run, and some older specialized Jev CLIs remain OpenRouter-only.

### Stage 2A. Local / Harness-first setup — PR #56

An interactive/offline `npm run setup` and flag-driven installer create
case-compatible **private external workspaces**, intentionally empty
data/business-rule templates and an optional generic stdio MCP connector
file. `--dry-run` and read-only `--check` inspect prerequisites.
Compatibility is tested with the existing `yaai_workspace_overview`
and task registry; existing modified configs are never overwritten.

This is **not** an authenticated deployment, LLM/model provider selector,
key vault, live connection test, billing manager or complete UI installer.
See [Local and Harness setup](local-setup.md).

### 2. Setup, provider profiles and secrets

- **2A done:** guided Local/Harness-first workspace setup and offline doctor.
  **2B now available:** generic Jev transport selection and offline key
  presence check. **Still missing:** managed secret store, provider quota/
  price validation and safe paid test with explicit approval.
- Capability-based Jev adapters: current OpenRouter Decisions first;
  official TypeSafe adapter only after verifying its separate API
  request/response contract. Reject unsupported custom base URLs.
- **No API credential in reports/tasks/commits/logs**; explicit paid
  caps, confirmation and provider provenance; entirely offline
  connectivity diagnostics until the user authorizes a test request.

Exit: fresh machine can configure a local project, use stored evidence
without an LLM, inspect provider capabilities, and see what costs money.

### 3. MCP and execution with policy

- Expose project-scoped task inspection now; then narrowly expose
  one authorized, resumable research operation with a budget gate.
- Use Skills to guide compatible Harness clients; separate tool
  permissions for read, draft, paid collect and mutate.
- No autonomous arbitrary shell execution via a public MCP endpoint.

Exit: external agent can safely launch an approved test workflow,
get status and evidence, and cannot incur cost without authorization.

### 4. Web Studio, knowledge layer and report components

- Browser project switcher and shared task history (desktop/tablet).
- Contextual help: short tip → expandable interactive explanation
  → versioned examples. CI checks references for changed features.
- Safe structured components for analytics/reports, with exports
  HTML/CSV/XLSX/PDF as relevant. No arbitrary generated JS executing
  with credentials.

Exit: report viewed in web UI is consistent with MCP/task artifacts;
a changed function has a checked and current help example.

### 5. VPS and Telegram

- Headless worker/health checks, persistent jobs, bounded scheduler,
  HTTPS/reverse proxy, backups and upgrade procedure.
- Telegram notifications/bot and optional Mini App using the **same**
  authenticated backend. Telegram login tokens must be verified
  server-side; a Telegram account alone is not sufficient for admin
  rights. Remote MCP has its own auth/token scopes.
- Self-hosted auth and write permissions must be security-reviewed
  **before exposing server.mjs to the internet**.

Exit: a staging VPS can run a read-only monitoring schedule and notify
an authorized user, with revocation and safe recovery.

### 6. Marketing deliverables and campaign intelligence

- Reuse grounded sources to build a keyword cluster, cross-negatives
  draft, ad-copy alternatives, landing recommendations and correctly
  validated platform-specific import exports. Import is reviewed;
  never silently change an ad account.
- Attach Yandex Metrica/Direct and later Google Ads with separate OAuth/
  credentials and project-scoped access controls.
- Begin with anomaly alerts and **dry-run** recommendations. Auto-pause,
  restart, editing and bulk actions only after audited source metrics,
  delayed-conversion handling, deterministic guards, staged approval,
  rollback/reconciliation and human-labeled accuracy review.

Exit: export a sample campaign in an actual target platform format,
then optionally run a staging monitoring scenario **without live writes**.
Paid/live ad actions are a separately approved milestone.

## Deferred until evidence exists

No speculative agent mesh, full autonomous marketing manager, public
multi-tenant SaaS, trading-grade real-time SLA, or all-at-once redesign.
Licensing for third-party components must be checked before bundling.
Model thresholds (Jev) require labeled examples before high-impact use.

## Implementation / review discipline

For each small PR:
1. Name the **user-visible result**, supported existing files, and costs.
2. Implement minimal reusable code with no network by default.
3. Add offline tests: happy path, corrupt inputs, wrong-project access,
   unsupported permissions, restart/retry and zero unauthorized calls.
4. Run `npm run check` and examine the CI logs. Merge only after green.
5. Explain what tests prove, what is **not proven**, and one next step.
6. Keep this plan updated with completion date / PR link as stages land.

Stage 1A will not run or authorize anything just by registering a task.
