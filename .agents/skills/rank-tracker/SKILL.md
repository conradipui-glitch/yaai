---
name: rank-tracker
description: "Track Yandex Webmaster average search positions over time, surface movers and striking-distance queries, and separate query-level movement from page-level movement."
---

# YAAI Rank Tracker

## Goal

Use dated Yandex Webmaster exports to answer:

- which queries improved or declined;
- which queries appeared or disappeared;
- which queries sit close enough to the top to deserve attention;
- which specific URL moved for a query.

The metric is **Yandex Webmaster average position**, not a live point-in-time SERP rank.

## Required context

Start with `yaai_workspace_overview`.

A dated Webmaster CSV must be available inside the selected yaai workspace. The CSV should contain date, URL, query, clicks, impressions and position. Region/host are used when present.

## Workflow

1. Call `yaai_workspace_overview`.
2. Call `yaai_rank_tracker` with the workspace-relative CSV path.
3. Use a meaningful `minImpressions` threshold when low-volume noise would distort the review.
4. Review:
   - `improvements` — lower average position number than on the previous date;
   - `declines` — worse average position;
   - `newQueries` and `lostQueries`;
   - `strikingDistance` — default average positions 5–20;
   - `pageMovements` — movement for the same query + URL + region.
5. If a query has `urlCount > 1`, do not treat the query-level average as proof that one page owns the query. Use `yaai_webmaster_overlap` if ownership/cannibalization needs investigation.
6. If demand priority matters, cross-check the same topic with `yaai_analyze_latest` and `yaai_build_page_plan`.
7. Prefer opportunities where meaningful Wordstat demand and near-top Webmaster position point in the same direction.

## Output

Return:

1. **Position snapshot** — current date, query count and Top 3 / Top 10 / Top 20 distribution.
2. **Moved up** — strongest improvements with impressions and URL context.
3. **Moved down** — meaningful declines that deserve investigation.
4. **Near the top** — striking-distance queries, ordered by practical opportunity.
5. **New / lost** — only material rows; explain that thresholding can affect this bucket.
6. **Next action** — one concrete page or measurement action.

## Guardrails

- Say **average position**, not "exact current rank".
- Do not claim causation from a position change alone.
- Do not call a multi-URL query harmful cannibalization without further evidence.
- Do not invent missing dates, impressions, clicks, positions or URLs.
- A one-day change is a signal, not a trend; prefer repeated movement across more dates when available.
- Keep Webmaster rank data separate from Wordstat demand counts.
