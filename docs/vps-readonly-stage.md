# VPS Stage 3A — isolated, authenticated read-only staging API

The protected `GET /v1/signals` route now also shows **saved**
weekly advertising metric findings in its case-specific list.
It remains metadata-only; it never reveals full numerical campaign
evidence or authenticates to an advertising account.
[Offline metric review rules](weekly-metric-rules.md).

**Status:** implementation + example configuration + offline integration tests.
**Not deployed to a real VPS**, not a production security audit.

## Why a separate process?

**Never expose the existing `server.mjs` or `mcp-server.mjs` on a public
VPS as-is.** The former includes POST endpoints for Yandex queries and
returns configuration intended for a localhost UI. The latter is a
read-only stdio interface, **not** an authenticated remote MCP server.

Instead, this stage introduces a **separate** Node HTTP process with
only three operations:

| Route | Access | Result |
| --- | --- | --- |
| `GET /healthz` | Public | Generic liveness boolean; no client data |
| `GET /v1/info` | Bearer token | Selected case ID and read-only capabilities |
| `GET /v1/tasks` | Bearer token | Up to 50 task metadata records for ONE pinned case |
| `GET /v1/tasks/task-...` | Bearer token | One task metadata record; 404 for other cases |
| `GET /v1/signals` | Bearer token | Case-scoped signal metadata, read-only; **no actual message sending** |

All other routes, including `/api/batch`, `/api/test`, `/api/config`,
file downloads, raw evidence, generic shell execution, task creation,
writes or model execution, are absent. Other HTTP methods are rejected.
No CORS is enabled, and responses use `Cache-Control: no-store`,
`nosniff`, restrictive CSP, no-referrer and a generic error message
rather than leaking private paths. The bearer comparison uses constant
time digest comparison. A simple in-memory unauthorized-request limit
rejects excessive guesses, but **a TLS/reverse-proxy-level rate limit
and external security review are still needed**.

## Launch privately on loopback — no public URL yet

Create/choose a private workspace through the existing Local setup and
make sure at least one case exists. Generate a **random secret with at
least 32 non-whitespace characters** into a file accessible only to the
dedicated service account. Do not put the token into CLI arguments, Git,
a public .env or project task descriptions. For example, on a
properly provisioned Linux server under the dedicated administrator
account, use a restrictive umask and an operating-system random source.

Run only from a trusted terminal on a development/staging host:

~~~bash
YAAI_VPS_TOKEN_FILE=/safe/private/read-token \
  npm run vps:readonly -- --workspace /var/lib/yaai/client-a --case client-a
~~~

The service is hardcoded to bind **127.0.0.1:8790** by default,
regardless of environment host configuration. Configure another port
via `YAAI_VPS_READ_PORT`; it still binds to loopback only. The startup
checks the case directory and the owner-only token file, failing closed
if the case is missing, the token too short or the token file is unsafe.

Use `Authorization: Bearer <token>` for its private read endpoints.
Provide the header through your trusted client secret store, not by
typing the token into a logged command. The HTTP bearer header is
appropriate only across an authenticated **HTTPS** connection on an
actual VPS. Without the header, tasks return 401. The public health
endpoint deliberately reveals no client metadata. This is an API,
**not a finished browser login, Telegram Mini App or mobile dashboard**.

For manual Linux staging, review both **examples**, copying them
to your own administrator-managed locations only after adjusting
domain, paths, service account and ownership:

- [`deploy/vps/yaai-readonly.service.example`](../deploy/vps/yaai-readonly.service.example)
  — Node's limited read-only process with systemd `LoadCredential`
  for `read_token`; no provider keys or writable data directories.
- [`deploy/vps/Caddyfile.example`](../deploy/vps/Caddyfile.example)
  — HTTPS termination via Caddy, proxy to loopback and a restriction
  to GET only. A valid domain, DNS, firewall and certificate issuance
  are prerequisites. Caddy itself is **not installed** by YA AI.

Recommended boundary: public internet → HTTPS proxy → loopback private
read-only API → one selected private workspace. The bearer token is
a second authorization check performed by YA AI and has no relation
to Jev/OpenRouter/Yandex credentials. Do not expose port 8790 publicly.

This example is suitable for testing a **single-owner, one-case**
deployment only. Multiple clients/users need independent scoped
accounts and project permissions, not a global shared token.

## Encrypted backup / restore drill (first stage)

The optional backup tool supports a **small local workspace**
(up to 24 MiB total source data, 8 MiB for an individual file). It
archives only the allowlisted directories:
`cases/`, `presets/`, `planners/`, `results/`, `snapshots/`,
`inputs/`, `tasks/`.

It **does not archive** `integrations/`, .env, provider credentials,
systemd credentials, arbitrary hidden files or symlink targets. Existing
task and saved result paths are kept relative to the workspace. After
restore, re-run the setup doctor and reconnect per-case Jev/MCP
integrations. Review external evidence and client permissions before
resuming any work.

Create a separately stored **random 256-bit key** in a private
owner-readable-only file. The program expects exactly 64 hexadecimal
characters; it does not accept the key itself as a command argument.
Keep an offline copy of the backup key **separate from backup files**.
Without that key, encrypted data cannot be recovered.

Backup:

~~~bash
npm run vps:backup -- backup \
  --workspace /private/client-a \
  --out /safe/backups/client-a-20261014.yaai-backup \
  --key-file /safe/keys/backup-key
~~~

Verify the backup and *do not write restored files*:

~~~bash
npm run vps:backup -- verify \
  --in /safe/backups/client-a-20261014.yaai-backup \
  --destination /private/restore-test-client-a \
  --key-file /safe/keys/backup-key
~~~

Restore only into a **NEW, nonexistent** destination:

~~~bash
npm run vps:backup -- restore \
  --in /safe/backups/client-a-20261014.yaai-backup \
  --destination /private/restore-test-client-a \
  --key-file /safe/keys/backup-key
~~~

Files are encrypted using AES-256-GCM with a random nonce and gzip
compression. The authenticated decryption and a SHA-256 hash for every
entry are checked **before** writing a restored file. An incorrect key,
modified archive, unsafe paths, duplicate entries, symlinks in source,
existing restore target and oversized workspace are rejected. New files
have owner-only permission on POSIX systems. This protects against
accidental data exposure in an unencrypted backup, but does not replace
a managed offsite retention policy, secure deletion or disaster recovery
plan. Windows ACLs and network filesystems require additional review.

**Do not turn on unattended backup jobs until rotation, retention, disk
space alerts and restore testing have been designed and approved.**

## Tests and deployment gate

~~~bash
npm run vps:selftest
npm run check
~~~

The integration suite opens a **loopback-only** HTTP server in a
temporary test process, checks no-token/invalid-token refusals, foreign
case denial, forbidden routes/methods and metadata redaction. It also
encrypts a synthetic multi-case workspace, verifies and restores it,
checks tamper/wrong-key refusal and secure permissions. **No real VPS,
DNS, TLS issuance, provider APIs, paid requests or advertising operations
are involved.** Passing these tests is **not proof** the Caddy/systemd
templates have been validated on a target Linux distribution.

Before a public VPS release, still required: a real TLS staging
deployment smoke test, IP-level/rate-limit review, token rotation and
revocation procedure, hardened per-user auth, external security
testing, audit logs and measured backup/restore drills on the actual
VPS. See [security go/no-go](credential-delivery-and-vps-readiness.md).
