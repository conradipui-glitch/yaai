# Pain Discovery v1 — Wordstat + Yandex SERP + Jev

This is a source-grounded **hypothesis detector**, not a claim that a model probability proves audience pain. Reuses the Yandex Wordstat topRequests endpoint, existing Yandex Search API v2 SERP collector, and Jev (typesafe/jev-1.13) through OpenRouter.

## 1. Bounded Wordstat collection

Use existing YAIS_API / YANDEX_API_KEY; optional YAIS_FOLDER_ID / YANDEX_FOLDER_ID is auto-discovered when possible.

~~~bash
npm run pain:wordstat -- \
  --seeds "автоматизация продаж,обработка заявок" \
  --region 225 \
  --num-phrases 60 \
  --out /private/pain-wordstat.json \
  --execute
~~~

Maximum three seeds (one metered topRequests call per seed), 200 phrases each. Region 225 is an example; use your intended numeric Yandex region ID. Missing counts are kept null. Existing case-specific Wordstat JSON from the main engine can be reused instead.

## 2. Prepare a small query plan (offline)

~~~bash
npm run pain:prepare -- \
  --topic "автоматизация продаж" \
  --wordstat /private/pain-wordstat.json \
  --limit 8 \
  --out /private/pain-query-plan.json \
  --query-file /private/pain-search-queries.txt
~~~

Wordstat-observed phrases and newly generated search hypotheses are labeled separately. **Generated queries are not measured demand.** Review the query file before paying for Search API calls.

### Relevance guard before paid steps

YA AI now runs a **conservative offline word-sense check** on Wordstat
candidate phrases when the research is about processing requests, leads,
sales or CRM. A phrase about congratulating a person named Лида, a surname
Лидов or a literal road should not be mistaken for marketing leads or
expensive enquiries. The rule **does not reject every short or ambiguous
phrase**: uncertain observations remain eligible and are flagged for human
review rather than silently treated as irrelevant.

The query plan saves a `relevanceAudit` section with the candidate count,
excluded count, reason codes and the **original text and observed count** of
each rejected phrase. The same guard applies again before selecting
Wordstat observations for paid Jev evaluation; the Pain Map stores
`sourceSelection`, and the standalone Evidence Report surfaces the audit.

This is a narrowly targeted **heuristic**, not a semantic proof of relevance.
It does not fetch webpages, revise the original Wordstat data or improve Jev
accuracy by itself. If a flagged term is relevant to your real business,
inspect the original source and revise the study topic/query plan explicitly.
Never infer a reduction in model false positives without independent human
labels.

**Versioning:** Research-resume manifests bind the rules/code used for source
selection. After this change, old query plans may be incompatible with a new
resume; start a fresh research directory if the manifest rejects it, and
review costs again before authorizing new Yandex/Jev calls.



## 3. Existing Yandex SERP collector

~~~bash
npm run serp:collect -- \
  --query-file /private/pain-search-queries.txt \
  --region 225 \
  --groups 5 \
  --out /private/pain-serp.json \
  --execute
~~~

Stores only result titles, passages, URLs and result positions. No full pages are fetched. A snippet is not automatically a customer's complaint.

### SERP relevance before Jev (offline)

After Yandex returns the raw SERP, YA AI examines **unique valid snippets**
before selecting its limited and potentially billable Jev batch. Original
`serp.json` is left intact.

For lead/request/CRM research, only clearly unrelated personal-name
greetings, a journalist surname, literal-road pages and search-query
homonyms are automatically excluded. Pages without an exact topic-word
match are **retained** with a `topic-not-explicit-in-excerpt` flag,
because genuinely early/emerging signals and synonyms may use unfamiliar
vocabulary. Business-context pages, seller promotions and model negatives
are also retained. This is a conservative heuristic, **not a universal
semantic relevance model**.

The Pain Map records a separate `serpSourceSelection` audit, which counts
eligible unique source snippets *before* the Jev limit, and distinguishes
`excluded` with reasons from `review` with retained URLs. Each Jev-assessed
SERP observation also retains its `sourceRelevance` decision. An excluded
source is **not** an erroneous Jev classification, a human negative label
or a confirmed irrelevant market signal. The report displays the audit and
links to original pages for manual inspection. Source citations are still
SERP snippets, not verified full page texts.

The offline regression `npm run pain:serp:relevance:selftest` covers
intentional off-topic pages, alternative vocabulary, marketing promotions,
source integrity, HTML escaping and report traceability. No API call is made.

## 4. Jev → Pain Map

The already configured YAIS_AI / OPENROUTER_API_KEY is used for model calls.

~~~bash
npm run pain:analyze -- \
  --topic "автоматизация продаж" \
  --wordstat /private/pain-wordstat.json \
  --serp /private/pain-serp.json \
  --limit 30 \
  --out /private/pain-map.json \
  --md /private/pain-map.md \
  --evaluation-out /private/pain-jev-evidence.json \
  --execute
~~~

Either source may be omitted if only Wordstat or only SERP evidence exists. The default evaluates at most 30 observations (hard ceiling 150).

Each observed phrase/snippet is classified by pain presence, controlled pain category, voice (search question, first person, seller promotion, third party or unknown), solution-seeking intent and urgency. Categories only use source evidence where pain probability is at least 0.65. Uncertain labels route to review; all cards remain **hypotheses requiring independent validation**. Source links and observed phrase counts remain attached. Wordstat counters are not summed.

## Data-quality boundaries

- Wordstat counts are overlapping phrase-containing counters, not distinct people, purchases or measured leads.
- A search phrase is not an identifiable buyer's testimony.
- SERP snippets are not the full page and may quote ads or another author.
- Jev certainty is uncalibrated and not a substitute for ground truth. Test precision/recall using a human-labeled sample before taking business actions.
- No automated messaging or publishing is triggered.
- The read-only yaai_pain_evidence MCP tool views saved results without making any API calls.
- The pain-discovery Agent Skill instructs agents to distinguish source text, model inference and human review.

## Validation

~~~bash
npm run pain:selftest
npm run check
~~~


## Human quality verification

Pain Discovery 0.18 preserves both accepted and rejected observations in evidenceLedger for human review. Use `pain:review`, `pain:review:interactive` and `pain:quality`; see [pain-quality.md](pain-quality.md). Existing older Pain Maps must be regenerated to measure recall because they do not preserve Jev negatives.
