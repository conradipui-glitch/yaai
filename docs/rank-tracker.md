# Yandex Rank Tracker

`yaai` can analyze dated Yandex Webmaster query-to-URL exports as a lightweight first-party rank tracker.

It uses the official export columns:

- date;
- host;
- URL;
- query;
- region;
- clicks;
- impressions;
- position.

The position is an **average Yandex Webmaster position**, not a live SERP scrape.

## Why this comes before external SERP tracking

This gives the engine a direct answer to "where does our own site already appear?" without introducing another provider, API key, or paid request stream.

It complements Wordstat:

```text
Wordstat                   Webmaster Rank Tracker
"What is searched?"        "Where do we appear?"
          \                 /
           \               /
            Page Planner
                 ↓
      EXPAND / CREATE / MERGE / HOLD
```

## CLI

Analyze a private Webmaster export:

```bash
npm run rank:track -- \
  --input /private/site-queries.csv \
  --out /private/rank-tracker.json \
  --min-impressions 5
```

Optional striking-distance boundaries:

```bash
--striking-start 5 --striking-end 20
```

The output file is created with private file permissions and is not overwritten.

## MCP

When the CSV is inside the selected yaai workspace, agents can call:

```text
yaai_rank_tracker
```

Arguments:

- `relativeCsvPath` — required, workspace-relative;
- `minImpressions` — default 1;
- `strikingStart` — default 5;
- `strikingEnd` — default 20;
- `limit` — maximum rows per detailed result group.

The MCP path remains analysis-only. It does not start or pay for Webmaster exports.

## What is calculated

For the two latest dates present in the CSV:

- improvements;
- declines;
- new queries;
- lost queries;
- striking-distance queries;
- page-level movement for the same query + URL + region;
- Top 3 / Top 10 / Top 20 distribution.

Query-level average position is impression-weighted across matching URLs/regions. If one query appears on multiple URLs, the output includes `urlCount` and the URL list so the agent does not mistake a blended signal for single-page ownership.

## Important interpretation rules

- Lower position number is better.
- `positionDelta > 0` means improvement.
- `positionDelta < 0` means decline.
- New/lost buckets are affected by `minImpressions`; a query below the threshold may look absent.
- A one-day change is not proof of a durable trend.
- Multi-URL visibility is only an overlap candidate; use the overlap analyzer before discussing cannibalization.

## Data collection

Use the existing Webmaster workflow to obtain dated CSV data. The extended export supports date, URL, query, region, clicks, impressions and position. Keep raw client exports private.

See **[webmaster.md](webmaster.md)** for OAuth, quotas and export commands.

## Validation

```bash
npm run rank:selftest
npm run mcp:selftest
npm run check
```
