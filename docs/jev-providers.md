# Jev provider profiles — Stage 2B

YA AI now supports **two fixed, verified HTTP transports** for the
**generic** Jev evaluation workflow:

| Provider | HTTPS endpoint | Default model | Secret environment variable |
|---|---|---|---|
| `openrouter` | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13` | `YAIS_AI` (fallback `OPENROUTER_API_KEY`, `YAAI_OPENROUTER_API_KEY`) |
| `typesafe` | `https://api.typesafe.ai/v1/systemone` | `jev-1.13.0` | `TYPESAFE_API_KEY` (fallback `YAAI_TYPESAFE_API_KEY`) |

Sources: [OpenRouter Jev guide](https://openrouter.ai/blog/insights/what-is-jev/),
[official TypeSafe API reference](https://docs.typesafe.ai/api).

The API body is the **same narrow contract**: model ID, state, and a map
of typed `choice`, `noul`, `score` questions. The transports have
different model namespaces and credentials. We do NOT try to use one
provider's key on another endpoint. Endpoints are pinned in source code;
arbitrary/custom URLs are not supported (protecting secrets from SSRF).
The direct TypeSafe transport has not yet been exercised with a real user
key or verified for live rate limits/prices: such verification requires
explicit authorization and may incur charges.

## Per-project installation profiles — Stage 2C

`npm run setup` now generates a private case-specific profile at
`WORKSPACE/integrations/jev.CASE_ID.json`. Configure a provider during
installation with `--jev-provider openrouter|typesafe`, optionally
`--jev-model` and `--jev-key-env` (allowlisted environment variable
name only). Existing profiles are preserved, not automatically switched.

Read exactly that case profile using:

~~~bash
npm run jev:provider -- --workspace /private/project --case client-a
~~~

`npm run jev:evaluate -- --workspace /private/project --case client-a
--input ... --profile ... --out ... --execute` selects the saved provider,
model and **only the exact configured environment variable**.
Explicit provider/model overrides that conflict with the saved choice
are rejected, rather than silently using another credential. This is
configuration selection, not proof of provider authentication.

The generic evaluator still accepts its original explicit
`--provider` / `--model` flags when no project profile is requested.
Older specialized Jev commands are **not** all migrated.

## Offline provider doctor (no billable requests)

~~~bash
npm run jev:provider -- --provider openrouter
npm run jev:provider -- --provider typesafe --model jev-1.13.0
npm run jev:provider -- --provider typesafe --require-key
~~~

The doctor prints a fixed endpoint, current model, acceptable credential
variable **names**, and a boolean `credentialPresent`, never key values.
Its `keyValidatedByProvider`, `modelAvailabilityVerified` and
`priceVerified` remain `false`. `--require-key` returns a failing exit
code when no key is available. It does not write files or make requests.

This stage deliberately **does not** implement a key vault. Supply
credentials via your local shell, OS secret store or Harness/VPS
secret-injection mechanism. Do not paste keys into chat, README,
project JSON, command-line arguments or GitHub Actions output.

## Explicit paid decision using a selected provider

OpenRouter (legacy behavior remains the default):

~~~bash
npm run jev:evaluate -- \\
  --provider openrouter \\
  --input /private/items.json \\
  --profile examples/evaluation-profiles/lead-qualification.json \\
  --out /private/lead-openrouter.json \\
  --execute
~~~

Official TypeSafe **with its own key set as `TYPESAFE_API_KEY`**:

~~~bash
npm run jev:evaluate -- \\
  --provider typesafe \\
  --model jev-1.13.0 \\
  --input /private/items.json \\
  --profile examples/evaluation-profiles/lead-qualification.json \\
  --out /private/lead-typesafe.json \\
  --execute
~~~

The same selector is available as `YAAI_JEV_PROVIDER`; explicit
`--provider` wins. `YAAI_JEV_MODEL` must match the selected provider.
If an old OpenRouter model ID is still set in the environment, remove
that variable or override it explicitly with `--model jev-1.13.0`.

**Nothing is sent without `--execute`.** That flag is permission to make
actual potentially billable model calls. Examine batch size, provider,
model, profile and output path first. Real API pricing/quotas can change
and are **not checked by the offline doctor**.

## Results, checkpoints and human review

- For OpenRouter the saved evidence shape and existing checkpoint hashes
  remain backwards-compatible.
- Direct TypeSafe adds `source: "typesafe-systemone"` and a distinct
  `transportProvider: "typesafe"`. Its cache signatures include the
  provider, so a TypeSafe request cannot consume a cached OpenRouter
  answer even when states and questions are identical.
- Response `model` always records the model reported by the provider;
  it may differ from the requested alias.
- Cost fields are measured only when the API returns a usable cost
  value. TypeSafe's published response format normally exposes tokens
  but no USD price; in that case `totalCost: null` and a positive
  `missingCostCount` are the correct result, not fabricated free usage.
- The existing `jev:seo route` human-review queue now accepts saved
  direct-TypeSafe evaluations with verified source provenance. No
  automatic changes to website, Direct or Google Ads are enabled.
- Existing pain/distribution/transcript-specific CLI integrations still
  use their OpenRouter-only invocation defaults; this PR does **not**
  claim a universal provider selection in every old workflow.

## Limitations & next stage

Mocked transport tests prove our request/answer contract against saved
documented shapes, not real TypeSafe authentication, billing or outages.
No secrets are persisted in setup/workspace reports. No paid calls are
part of `npm run check`.

Next: connect provider diagnostics to the guided setup screen while
keeping separate protected secret configuration, then test one live
TypeSafe request only with explicit user approval and a known spending
limit. Credential storage, provider discovery/price lookup, VPS, Telegram
and general paid task execution remain separate work.
