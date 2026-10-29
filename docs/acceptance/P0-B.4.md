# P0-B.4 — Candidate-set quality and adjudication status

**Iteration:** P0-B.4. **Date:** 2026-10-29.
**Decision:** **AWAITING INDEPENDENT HUMAN REVIEW** — candidate fixtures and
automated structural tests are not independent golden labels.
**Next after ACCEPT:** P0-B.5 (compare current YAAI methodology with
the versioned Operator Playbook on the same adjudicated samples).
**Do not start P0-C while P0-B.4 or P0-B.5 is pending.**

## Deliverables

- [Reference candidates (JSON)](../../playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json):
  **19 scenarios**, 14 explicitly synthetic, 5 source-linked public site
  observations collected 2026-10-29 (Omsk service businesses).
  Contains model-authored *candidate* labels, evidence IDs, reason,
  alternative explanations, next check, prohibited claims, no outbound.
- [Blind reviewer worksheet](../../playbooks/operator-local-smb-diagnostic-v0/fixtures/P0-B.4-blind-review.md):
  deliberately hides expected statuses until external review is recorded.
- [Practical blind-review workflow](../../playbooks/operator-local-smb-diagnostic-v0/fixtures/REVIEW-WORKFLOW.md)
  and offline `scripts/operator-blind-review.mjs`: export **only** source observations,
  generate private review template, validate all entries and allow comparison
  only after full self-attested independent human review. A CLI flag cannot prove
  a real human took part.
- [Dated recheck of five public pages](P0-B.4-source-recheck.md):
  links were revisited through public **text** pages on 2026-10-29; this is
  not independent verification and not a browser UX test.
- [Offline QA script](../../scripts/operator-golden-set-selftest.mjs):
  validates IDs, source metadata, observation attribution, timestamps,
  rights, region flags, linked evidence, reason codes, fail-closed
  negative mutations, and **rejects false claims of human verification**.
- Existing [P0-B.3 Playbook](../../playbooks/operator-local-smb-diagnostic-v0/PLAYBOOK.md)
  and Evidence Report v1 remain unchanged.

## Coverage

| Origin | Count | Caveat |
| --- | ---: | --- |
| Entirely synthetic cases (`s01–s14`) | 14 | Test methodology and error handling only — fictional businesses, no external URLs |
| Public web paraphrase (`r01–r05`) | 5 | URL and dated human-readable observation, **not** internal metrics, confirmed business defect, commercial opportunity or current truth forever |
| **Total** | **19** | Initial expected statuses were authored with assistance from AI; not independently adjudicated |

Candidate status distribution: **2 `propose_draft`**, **10
`hold_for_review`**, **7 `insufficient_evidence`**.
Distribution is a set-design result, **not a precision/recall estimate**
or market prevalence. All positive cases are synthetic so no real
company is marked as a prospect on these excerpts alone.

### Public URLs that were opened during sample creation

- `https://www.ritmservice.ru/direction/remont-i-diagnostika-pk/`:
  diagnosis priced separately but free with repair — not contradiction.
- `https://www.omsk.ditell.ru/`: source text/alt descriptions
  contain several differing marketing counts — ask for visual
  verification before alleging a defect.
- `https://oms.re-device.ru/`: Omsk page and Moscow logistics details
  coexist on extracted page — review intended service geography.
- `https://ok-omsk.ru/remont-kompyuterov/`: page displays promotion
  ending `28.10` without visible year in extracted text — verify
  conditions before proposing changes.
- `https://www.rss.ru/regions/omsk`: regional contacts and service
  categories are present — no verified weakness from these data.

**These are neither business accusations nor customer diagnoses.**
We did not contact the businesses or access their private accounts.
Public content may be updated or have layout-dependent text.
Before operational use a reviewer must re-open URL, verify dates,
context and page visibility. A source missing later gets a new
verification event; past observations stay historical.

## Single-file reviewer and genuine browser tests (2026-10-29)

A self-contained **offline HTML review page** is built from the existing
19-case blind projection with **no candidate answers**. A human can use it
without installing Node or fetching an additional JSON file; data are
embedded in the HTML, not sent to a server. [Builder](../../scripts/build-operator-review-standalone.mjs),
[Chromium test](../../scripts/operator-review-browser-selftest.mjs) and
[dedicated Actions workflow](https://github.com/conradipui-glitch/yaai/actions/workflows/p0b4-reviewer-browser.yml)
provide reproducible build, desktop/mobile functional QA and downloadable
artifact with screenshots.

Checked in actual headless Chromium: desktop first/last scenarios,
mobile first scenario, 19 entries, evidence selections, export, review
import after reload, zero default human-attestation flags, no network
requests, no page errors, mobile scrollWidth 390 = viewport 390. I also
inspected the generated screenshots for readable layout and no evident
clipping on these three surfaces. This is **not** an independent human
usability/accessibility certification.

**Quality boundary stays closed:** A complete human-blind evaluation of
all 19 cases, with individually justified source checks, still has NOT
happened. Test automation must not mark P0-B.4 accepted or open P0-B.5.

## Blind-review gate implementation (2026-10-29)

[GitHub Actions PR run #40864722289](https://github.com/conradipui-glitch/yaai/actions/runs/40864722289)
confirmed `npm run check` and `encoding-selftest` both PASS after fixing an
over-broad label-leak check. The new blind reviewer suite passed for
**19 cases**; negative tests ensure no preliminary solution key leaks,
wrong/cross-case evidence is rejected, incomplete reviews cannot be
compared, no automatic overwriting of an existing review is allowed.
The CLI makes the human review process reproducible **without** contacting
any outside company or incurring API cost.

- [Friendly local reviewer interface](../../tools/operator-review/index.html) —
  step-by-step offline UI that imports a blind package, displays sources,
  permits independent entry, exports/imports private review JSON;
  no API requests and no model-supplied candidate answers.
- [Offline reviewer procedure](../../playbooks/operator-local-smb-diagnostic-v0/fixtures/REVIEW-WORKFLOW.md)
  explains private export, independent labelling, data source dates and
  post-review comparison.
- [Five-source recheck](P0-B.4-source-recheck.md)
  was done using public text views, **not** browser UI or independent
  human adjudication.
- CI output explicitly states `Human labels: NOT COLLECTED;` therefore
  no claim of final P0-B.4 acceptance.

**Boundary:** independent human decisions, real browser visual QA and
source-by-source final adjudication remain **NOT RUN**. The source recheck
[found a material discrepancy in case r03](P0-B.4-source-recheck-events.json)
and did not rewrite the historical original. The new CLI cannot prove its reviewer is truly
a human; attestation is self-reported. The original candidate labels
remain unchanged and P0-B.5 stays blocked.

## Quality Gates T0–T7

| Gate | Status | Evidence / blocker |
| --- | --- | --- |
| T0 — scope and constraints | PASS | 19 cases (10–20), prescribed sectors, three decision types, explicit source provenance and review requirement |
| T1 — schema / unit / negative tests | **PASS** — [CI run](https://github.com/conradipui-glitch/yaai/actions/runs/40852543430) | Offline validation of source/observation IDs, uncertainty, URLs, attribution, dates, case isolation and mutations; **does not prove factual correctness** |
| T2 — backward compatibility | **PASS** — [CI run](https://github.com/conradipui-glitch/yaai/actions/runs/40852543430) | No code changes to other business paths; `npm run check` includes old P0-B.3 tests and prior YAAI regression tests |
| T3 — cross-tool consistency | PASS as contract-only; live runtime NOT RUN/N/A | Maintains reference to Playbook v0.1.0 and same project-scoped source/observation semantics; full Prospect→Audit→MCP→Studio pipeline not yet implemented |
| T4 — reproducibility | PASS for case IDs/metadata; true re-fetch NOT RUN | Validator reprocesses identical fixtures; does not collect websites in CI |
| T5 — security/cost | PASS for current offline scope | Fixture-only; no paid API; no mailing, publication, admin writes or external source fetch in tests |
| T6 — live UI | **PASS within tested desktop/mobile scope:** Node DOM smoke, **real Chromium** at 1365×900 and 390×844, blind import, save/export/reopen and source links; visual screenshot inspection. **Independent human accessibility/usability study NOT RUN** | [Dedicated browser workflow](https://github.com/conradipui-glitch/yaai/actions/workflows/p0b4-reviewer-browser.yml) also verifies no JavaScript errors, HTTP requests or horizontal overflow. Three screenshots and standalone reviewer are downloadable as workflow artifacts. |
| T7 — methodological quality | **BLOCK / NOT RUN** | No independent human has read and signed blind reference decisions. Proposed gold statuses are still candidates. Cannot legitimately calculate accuracy or move to P0-B.5 comparison. |

**Acceptance criterion still outstanding:** independent reviewer supplies
blind outcomes/evidence/uncertainties for all 19 cases, sources are
checked for current context, conflicts reconciled, and any mismatch
with preliminary labels is documented. Only then mark
`humanGoldStatus='accepted'` in a **new version** of the dataset
with reviewer identity/date recorded (without leaking private
identities into public CI). Do not edit existing initial labels
silently. Design a separate review artifact or auditable reviewer
approval record for this, not a boolean changed without proof.

## Decision

- **Candidate set / QA harness:** prepared; CI verified 19 cases, 31 source records, 36 observations, 10 negative mutations. `npm run check` and encoding selftest PASS ([run 40852543430](https://github.com/conradipui-glitch/yaai/actions/runs/40852543430)).
- **Independent gold labels:** NOT REVIEWED.
- **P0-B.4:** NOT ACCEPTED, awaiting independent manual review.
- **P0-B.5:** NOT STARTED.
- **P0-C:** NOT STARTED.

This is deliberate adherence to the user's
**«не переходить дальше без тестов и согласованности»** constraint,
not an implementation delay masked as success.
