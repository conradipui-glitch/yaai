# Credential delivery & deployment readiness — Stage 2D

YA AI can now use Jev (OpenRouter or TypeSafe) without storing an API key
in a client case, repository, task registry, result report, MCP descriptor,
command-line argument or shell command history. This is the **first safe
input mechanism**, not a production-grade encrypted vault.

## Local interactive Jev evaluation (one-time hidden key)

Start in a trusted terminal, with an already configured project:
~~~bash
npm run jev:provider -- \
  --workspace /private/project --case client-a
~~~
This prints the selected Jev provider/model, required environment variable
name and a **capability matrix**, but no key. If the environment doesn't
have the key, the paid request is not automatically started.

For a specific, independently reviewed set of input states and questions:
~~~bash
npm run jev:evaluate -- \
  --workspace /private/project --case client-a \
  --input /private/project/evidence/items.json \
  --profile examples/evaluation-profiles/search-term-triage.json \
  --out /private/project/results/evaluated.json \
  --prompt-key --execute
~~~
The CLI first checks \`--execute\`, paths, and JSON input/profile. Then it
requests the API key directly from a **local TTY in raw mode**, without
echoing characters. The key stays in process memory for that run only,
is **not** saved in YA AI workspace files and is not forwarded to MCP.
There is no token/connection test before the real explicit execution,
so a wrong key may still cause a rejected provider request. The call is
potentially billable; inspect how many items are in the input first.

- **No \`--execute\`** → immediate refusal before prompting.
- **Pipe, unattended shell or CI without a TTY** → \`--prompt-key\`
  refuses; secrets cannot be silently read from a logged pipe.
- **Cancel with Ctrl+C** → terminal raw mode is restored and nothing
  is sent to Jev.
- **No permanent private key store** → a later interactive invocation
  must enter the key again, or use controlled environment injection.

A compromised computer, terminal, process, debugger or shell can still
access a credential while it is being used. Raw TTY input is **not**
hardware-backed credential protection or encryption at rest.

## Harness-first and automation (environment-managed secrets)

For noninteractive execution, let the **operating system or Harness
secret manager** inject only the environment variable referenced in
\`integrations/jev.<case-id>.json\`, e.g. \`TYPESAFE_API_KEY\`.
For OpenRouter, the default is \`YAIS_AI\`; aliases are permitted only
when explicitly selected in the project profile. Never put the VALUE
in a generated \`mcp.<case-id>.local.json\`, repository file or
command argument. Do not paste it to a chat so an agent can "install"
the credential.

The generic evaluator honors that selected *exact* environment
variable when called with \`--workspace\` and \`--case\`, and still
requires \`--execute\`. The current MCP server is **read-only** and
has no paid evaluation tool; creating a Harness MCP connection does
not grant the AI authority to use the API key. Read-only MCP processes
do not need a Jev secret in their environment at all.

Windows: use your supported OS/Harness credential-injection mechanism
rather than committing or passing a key on the command line. POSIX:
choose a controlled process environment or service credential mechanism;
shell exports can be inherited by child processes and should be limited
to trusted processes. The local hidden prompt is platform-neutral
provided the terminal supports raw TTY input.

## Offline diagnostics: what can actually run?

~~~bash
npm run setup -- --check \
  --mode harness --workspace /private/project --case client-a
npm run jev:provider -- \
  --workspace /private/project --case client-a
~~~

Both checks are **offline**, show whether the specifically configured
environment variable is present (not its value) and now distinguish:

- ready code paths: local evidence/report inspection, read-only stdio
  MCP and the bounded generic Jev decisions executor (with explicit
  \`--execute\` permission and a separately available credential);
- provider limitations: direct TypeSafe is **not yet** in every old
  specialized Jev CLI, and Jev has not been live-validated here;
- unimplemented parts: paid MCP execution, authenticated remote MCP,
  protected VPS service, Telegram management, live advertising writes.

Provider availability, API validity, quota, prices and current model
capabilities remain **unverified by these checks**. The printed
\`credentialPresent\` field is not an authorization decision and not
proof of a good key.

## Local signals before external VPS deployment (Stage 3B)

A **case-scoped signal inbox** now exposes genuine persisted task
success/failure/interruption and earlier-result-link events via CLI,
read-only MCP and the isolated VPS reader. A local acknowledgement
does not trigger model requests or campaign changes. Telegram sending
and 24/7 monitoring remain unimplemented.
[Signal inbox and restrictions](signal-inbox.md).

## Stage 3A: limited read-only VPS components are available

A separate loopback-only authenticated task metadata API, example
Caddy/systemd staging configuration and encrypted backup/restore drill
have been implemented. They do **not** change the status of the existing
local `server.mjs` or `mcp-server.mjs`: neither should be exposed
publicly. A real host, cert issuance and external security review
remain outstanding. [Read-only deployment guide](vps-readonly-stage.md).

## VPS go/no-go checklist (DESIGN — not deployed)

**NO-GO today for public exposure of \`server.mjs\` or \`mcp-server.mjs\`.**
YA AI has local execution and read-only stdio MCP, not a secure SaaS
service or a distributed job manager. Before a user exposes a VPS:

1. Choose one authenticated HTTPS entry point with strict origin/host
   rules, TLS renewal, rate limits and sensible request size limits;
   keep database/worker/MCP listeners on loopback or a private network.
2. Design authenticated local accounts or verified Telegram login,
   explicit admin recovery, account revocation, MFA where appropriate,
   session expiration and anti-CSRF checks. Telegram user IDs are not
   inherently administrator permissions.
3. Implement project/tenant-scoped authorization for **every** file,
   credential, report, action and MCP call. Read-only capabilities do not
   grant access to an arbitrary client workspace.
4. Use a secret manager or system service credentials, *not* a world-
   readable plaintext \`.env\` or Docker command arguments; isolate
   provider keys by client and permitted operation and rotate after
   compromise.
5. Persist job state through upgrades/restarts, test concurrency and
   backups, restore and migration, and never reuse PID-only single-host
   locks as if they were a distributed lease.
6. Add spend caps, explicit human approval tokens and audited external
   writes, with delayed-conversion handling, abort/reconcile/rollback
   for advertising operations.
7. Test unauthorized access, stale tokens, secret redaction, SSRF,
   symlinks/traversal, network outages, power loss and restore before
   enabling a real URL.

**Next milestone:** conduct an approved remote staging test with a real
HTTPS certificate, token-revocation drill and encrypted restore test
before any remote task or advertising control. This document makes no claim that it currently
exists. See [delivery plan](yaai-delivery-plan.md).
