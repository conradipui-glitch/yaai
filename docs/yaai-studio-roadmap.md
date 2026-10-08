# YA AI Studio — future product direction (not an active implementation)

Status: agreed concept / backlog. **Do not start Studio implementation as part
of reliability fixes.** First stabilize the YA AI research engine and
recoverable, cost-controlled research workflows.

## Product concept

A downloadable local workspace built on the existing YA AI engine:

- A project list with chosen local directories. Each project owns its
  conversations, source evidence, generated reports and output files.
- Sidebar chats and an agent harness with a unified model selector across
  named API-provider connections. Offer reasoning effort, speed and output
  detail only where a provider/model genuinely supports them.
- An optional subscription connection only when supported by an official
  provider integration; subscription access is **not** assumed equivalent
  to unrestricted API access.
- MCP/tools and installable, reviewable Agent Skills. Live calls, repository
  writes, publishing, charges and other consequential actions require
  explicit user approval, configurable limits and an audit trail.
- An optional, unobtrusive interactive mascot explaining operations,
  progress, blockers and results.

## Research-to-outcome workflow

`Project → Chat → YA AI research → Evidence-backed report → User-reviewed
work plan → Deliverables → Optional publishing → Measured results`

Design a standard, structured **source-of-truth report model** with provenance,
observed values vs hypotheses, original sources, dates, missing fields and
spending records. Render from that model into interactive standalone HTML,
sortable tables, charts and exportable documents without paying to rerun the
same research.

On user request, transform verified evidence into content plans, article drafts,
site pages, motion-graphics presentations with optional narration and other
deliverables. Connect a website Git repository through a reviewed change/PR
workflow. Deployment must require explicit user approval and validation.

Provide a **Kanban** view derived from approved project tasks; optionally
offer **Scrumban** (priorities, work-in-progress limits, blockers and a weekly
goal) when the project is complex enough. Do not force a board for small tasks.
Distinguish agent progress from human-approved completion.

## Integration candidates — evaluate before adoption

- User-authored **Frontend Studio** skill for UI design, natural Russian
  copy, interaction states, accessible responsive layouts and visual QA.
  Import its source files and review usage before implementing the Studio UI;
  it is not included in this repository yet.
- [HeyGen Hyperframes](https://github.com/heygen-com/hyperframes) as an optional
  motion-graphics rendering integration.
- [OpenMontage](https://github.com/calesthio/OpenMontage) as an optional
  audiovisual creation workflow; check license/operational requirements
  before bundling or distribution.

Do not silently bundle large services or their paid providers with YA AI.

## Delivery order

1. Minimal local workspace: project folder, sidebar chat, one connected API
   provider, one genuine research flow, saved evidence.
2. Structured interactive HTML report and source traceability.
3. Task extraction with optional Kanban/Scrumban.
4. Reviewed content creation/skills; optional GitHub publication through PRs.
5. Media workflows and mascot, once core reliability and UX are verified.

**Definition of first useful release:** a user can open a folder, request one
study in chat, understand/approve its cost, obtain a persistent source-backed
report inside that folder, and resume work without repeating saved requests.
