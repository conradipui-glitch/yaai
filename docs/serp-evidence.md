# Yandex SERP / Competitor Evidence

`yaai` can collect a small, explicit sample of Yandex organic search results and turn it into competitor evidence for the existing decision engine.

This layer answers a different question from the other data sources:

```text
Wordstat         → what people search
Webmaster        → where our site appears over time
Search API SERP  → what pages/domains currently appear around us
```

SERP evidence is **not** allowed to replace Page Planner decisions. It is supporting evidence for CREATE / EXPAND / MERGE / HOLD.

## Collection

Live collection uses Yandex Search API v2 in XML mode.

Credentials:

```text
YANDEX_SEARCH_API_KEY=...
YANDEX_SEARCH_FOLDER_ID=...
```

If these are not set, the collector falls back to the existing `YANDEX_API_KEY` / `YANDEX_FOLDER_ID` aliases used by Wordstat.

Collection always requires explicit execution:

```bash
npm run serp:collect -- \
  --queries "купить баню,баня омск,кедровая баня" \
  --region 66 \
  --groups 10 \
  --own-domain example.ru \
  --out /private/serp-evidence.json \
  --execute
```

For a larger query list:

```bash
npm run serp:collect -- \
  --query-file /private/queries.txt \
  --region 66 \
  --groups 10 \
  --own-domain example.ru \
  --out /private/serp-evidence.json \
  --execute
```

Limits in this first implementation:

- one results page per query;
- maximum 50 queries per run;
- maximum 100 XML result groups per query;
- Russian search type;
- one explicit Yandex region id per collection.

The collector waits between requests and refuses to run without `--execute`.

## Evidence file

The normalized JSON stores only the fields needed by yaai:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-02T07:00:00.000Z",
  "source": "yandex-search-api-v2",
  "searchType": "SEARCH_TYPE_RU",
  "region": "66",
  "groupsOnPage": 10,
  "ownDomain": "example.ru",
  "queries": [
    {
      "query": "купить баню",
      "results": [
        {
          "position": 1,
          "url": "https://competitor.example/bani/",
          "domain": "competitor.example",
          "title": "Готовые бани",
          "passage": "..."
        }
      ]
    }
  ]
}
```

Raw XML is decoded only in memory and is not persisted by this workflow.

## Analysis

Analyze the saved file without any external API call:

```bash
npm run serp:analyze -- \
  --input /private/serp-evidence.json \
  --out /private/serp-analysis.json \
  --own-domain example.ru \
  --top 10
```

The analysis returns:

- own-domain presence/absence per query;
- best observed own position;
- domains/pages above the own result;
- repeated competitor domains;
- query coverage per competitor;
- Top 3 / Top 10 appearances;
- best and average observed positions;
- a simple visibility score within the selected top N.

The visibility score is only an ordering aid inside this collected sample. It is not traffic share, market share, authority, or a forecast.

## MCP

Agents can analyze an existing evidence file with:

```text
yaai_serp_evidence
```

Required:

- `relativeJsonPath` — file inside the selected workspace.

Optional:

- `ownDomain`;
- `topN`;
- `limit`.

The MCP tool never performs a live Search API request.

## Interpretation

A SERP collection is a snapshot of one query set, one region and one collection time.

Use it to support statements such as:

- "our domain was absent from the analyzed Top 10 for this query";
- "these three domains appeared repeatedly across the selected queries";
- "this competitor page was above our page in this snapshot".

Do not turn it into unsupported claims such as:

- competitor traffic or revenue;
- backlink strength;
- domain authority;
- durable ranking trend;
- market share.

Use Webmaster Rank Tracker for trend and first-party visibility; use Wordstat for demand.

## Validation

```bash
npm run serp:selftest
npm run mcp:selftest
npm run skills:selftest
npm run check
```
