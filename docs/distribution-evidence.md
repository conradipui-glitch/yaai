# Distribution evidence

`yaai` has a small platform-neutral evidence layer for researching where information is published, which entities repeatedly appear around a topic, and how observed content performs inside the collected sample.

This is **not** a social-media scheduler, CRM, ad platform, or universal cross-platform score.

## Shared contract

Every source adapter normalizes data into three reusable objects:

```text
Entity
  creator / channel / company / community

ContentItem
  video / post / article / other published item

MetricsSnapshot
  observed counters for one ContentItem at one time
```

A normalized dataset has this shape:

```json
{
  "schemaVersion": 1,
  "source": "youtube-data-api-v3",
  "platform": "youtube",
  "generatedAt": "2026-10-05T08:00:00.000Z",
  "queries": ["ai sales"],
  "entities": [],
  "contentItems": [],
  "metricsSnapshots": []
}
```

The contract lives in `lib/source-adapter.mjs`. Platform adapters should map source-specific payloads into this contract rather than leaking platform-specific structures into the analysis layer.

## First adapter: YouTube

The first live adapter uses the official YouTube Data API v3.

Set:

```text
YOUTUBE_API_KEY=...
```

Then explicitly collect a small research batch:

```bash
npm run youtube:collect -- \
  --queries "ai sales,lead automation" \
  --region RU \
  --language ru \
  --max-results 10 \
  --out /private/youtube-evidence.json \
  --execute
```

The collector:

1. calls YouTube search for each research query;
2. keeps video results only;
3. deduplicates video IDs across queries;
4. retrieves public `snippet` + `statistics` for the discovered videos;
5. writes only normalized `Entity / ContentItem / MetricsSnapshot` data.

The collector refuses to run without `--execute` and accepts at most 20 search queries per run.

## Local analysis

```bash
npm run distribution:analyze -- \
  --input /private/youtube-evidence.json \
  --out /private/youtube-analysis.json
```

The analyzer returns recurring entities/channels, content-query links, latest observed metrics, metric deltas when multiple snapshots exist, `sampleMedianViews`, and `sampleRelativeReach` when at least three collected items belong to the same entity.

## Important metric boundary

`sampleRelativeReach` means views for this collected item divided by the median views of the collected items for the same entity.

It is **not** causal lift from a placement, audience quality, conversion rate, market share, a cross-platform score, or necessarily a representative channel baseline when the sample came from search.

A search-selected YouTube sample is biased toward videos that matched the research queries. Use repeated or purpose-built collections before treating an entity baseline as durable.

## MCP boundary

`yaai_distribution_evidence` analyzes an already saved normalized JSON file inside the workspace. MCP never performs live YouTube or other platform API calls.

This preserves the same cost/safety boundary used by Yandex SERP evidence:

```text
explicit collector
      ↓
private normalized evidence
      ↓
deterministic local analysis
      ↓
MCP / Agent Skill
```

## Future adapters

Telegram, X, Threads, VK, RSS/generic web and other sources should implement the same contract.

Do not add a new parallel analytics engine per platform. Source-specific code belongs only in the adapter/collector; shared analysis should stay platform-neutral.
