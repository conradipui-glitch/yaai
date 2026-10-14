---
name: yaai-setup
description: "Guide a user through a safe YA AI local or Harness-first setup without requesting or exposing API secrets."
---

## Goal

Help the user install YA AI as an independent research workspace, or connect
that same workspace to a compatible AI Harness over the existing read-only
stdio MCP server. Avoid requiring a separate paid LLM API: the Harness may
provide writing and reasoning; YA AI supplies deterministic calculations
and stored evidence.

## Procedure

1. Confirm the user wants to configure **Local** or **Harness-first**.
   If there is a compatible installed checkout, reuse it. Do not assume VPS,
   Docker, Telegram, remote MCP, general agent execution or paid APIs exist.
2. Explain that the workspace stores private client-specific data and must
   be **outside** the YA AI engine Git repository. Get the workspace path
   and safe case ID from the user. Run the offline preview first:

   ~~~bash
   npm run setup -- --dry-run --mode harness --workspace /private/client-1/yaai --case client-seo
   ~~~

3. Before creating files, offer **OpenRouter** (default) or
   **TypeSafe** (direct) as the **per-case Jev decision provider**.
   For TypeSafe, add `--jev-provider typesafe` to the preview and
   creation command. State its model `jev-1.13.0` and environment key
   name `TYPESAFE_API_KEY`. This is only configuration; no API access
   or quota has been verified. Never request or display the key VALUE.
4. After explicit approval, run the same command without `--dry-run`.
   In Harness mode, it creates `integrations/mcp.<case-id>.local.json`. Explain that
   it is a **generic stdio MCP example**, not an automatic installation
   into a particular Harness. Existing legacy `mcp.local.json` stays intact. Let the user review/copy its `mcpServers`
   entry into the client-specific configuration.
5. Run the read-only doctor:

   ~~~bash
   npm run setup -- --check --mode harness --workspace /private/client-1/yaai --case client-seo
   ~~~

6. For a connected MCP client, verify `yaai_workspace_overview` sees the
   expected case. `yaai_tasks` and `yaai_task_detail` only inspect previously
   registered tasks and evidence; they must not claim to run jobs.
7. Tell the user that new cases have **empty seeds, regions, intents and
   planner targets**. A successful setup is **not** a completed SEO study;
   obtaining paid external evidence requires separate authorization.

## Credential handling after setup

For a **trusted local human terminal**, explain `--prompt-key --execute`
on the **generic** `jev:evaluate` CLI: hidden input is held only for
the run, never placed into the command, chat, MCP config or report.
Only run an explicitly authorized billable evaluation after inspecting
the inputs and number of requested decisions.

In Harness-first mode, recommend the Harness or OS-provided *protected
environment secret injection* for the selected case; do not have the AI
ask for the key in the conversation. The existing read-only MCP does not
need Jev credentials and cannot launch paid evaluations.
`jev:provider --workspace ... --case ...` shows **offline** capability
and secret-presence diagnostics, not live key validation.

Before recommending VPS or Telegram operation, review
[the VPS security checklist](../../../docs/credential-delivery-and-vps-readiness.md):
the current server lacks the authenticated deployment boundary for
public exposure.

## Guardrails

- Never ask for an API secret in chat, paste it into a Shell command or
  persist it to repository files, task descriptions, setup templates or
  visible logs. Credential setup belongs to a separate protected flow.
- Never execute `npm run setup` against the source repo itself, a filesystem
  root, a symlinked directory or another client's workspace without consent.
- Do not install packages or expose ports without the user's approval.
  `npm ci` can download software, but `npm run setup` itself is offline.
- Do not enable billable Jev, Wordstat, Search API, campaign changes,
  live schedules, a public server or write-enabled MCP automatically.
- Distinguish actual functionality from future roadmap promises. Before
  recommending VPS, Telegram OAuth/Mini App or a TypeSafe direct API
  adapter, verify they have been implemented and separately approved.

The **generic** Jev evaluator can read the chosen project profile with `--workspace` and `--case`, but paid requests still require explicit `--execute`. Never assume TypeSafe pricing or account access from the offline wizard.
