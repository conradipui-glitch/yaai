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

## Quality Gates T0–T7

| Gate | Status | Evidence / blocker |
| --- | --- | --- |
| T0 — scope and constraints | PASS | 19 cases (10–20), prescribed sectors, three decision types, explicit source provenance and review requirement |
| T1 — schema / unit / negative tests | **Check CI run** | Offline validation of source/observation IDs, uncertainty, URLs, attribution, dates, case isolation and mutations; **does not prove factual correctness** |
| T2 — backward compatibility | **Check CI run** | No code changes to other business paths; `npm run check` includes old P0-B.3 tests and prior YAAI regression tests |
| T3 — cross-tool consistency | PASS as contract-only; live runtime NOT RUN/N/A | Maintains reference to Playbook v0.1.0 and same project-scoped source/observation semantics; full Prospect→Audit→MCP→Studio pipeline not yet implemented |
| T4 — reproducibility | PASS for case IDs/metadata; true re-fetch NOT RUN | Validator reprocesses identical fixtures; does not collect websites in CI |
| T5 — security/cost | PASS for current offline scope | Fixture-only; no paid API; no mailing, publication, admin writes or external source fetch in tests |
| T6 — live UI | N/A | No UI built in this iteration |
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

- **Candidate set / QA harness:** prepared, subject to CI.
- **Independent gold labels:** NOT REVIEWED.
- **P0-B.4:** NOT ACCEPTED, awaiting independent manual review.
- **P0-B.5:** NOT STARTED.
- **P0-C:** NOT STARTED.

This is deliberate adherence to the user's
**«не переходить дальше без тестов и согласованности»** constraint,
not an implementation delay masked as success.
