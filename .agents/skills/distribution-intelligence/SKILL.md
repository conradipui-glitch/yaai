---
name: distribution-intelligence
description: "Analyze saved cross-platform content evidence to find recurring entities, topic distribution, observed content performance, and research targets without inventing cross-platform effectiveness."
---

# YAAI Distribution Intelligence

## Goal

Use normalized platform evidence to answer:

- which creators/channels/entities repeatedly appear around the selected research queries;
- which content items were discovered for each topic;
- what public counters were observed for those items and their source entities;
- whether repeated content or entity metric snapshots show growth over time;
- which entities or content items deserve deeper qualitative research.

This skill is the first step toward information-environment and distribution research. It does not claim causal placement effectiveness.

## Required context

Start with `yaai_workspace_overview`.

A normalized distribution evidence JSON collected by an explicit source adapter workflow must exist inside the selected workspace.

## Workflow

1. Call `yaai_distribution_evidence`.
2. Review entity `queryCount` and the queries that discovered each entity.
3. Review top collected content and latest observed metrics. Preserve platform-native counters such as Telegram forwards/reactions instead of reducing everything to likes.
4. If content or entity data has multiple snapshots, use `metricDelta` as measured counter movement between the two latest observations.
5. Use `sampleRelativeReach` only as a within-entity, within-collected-sample comparison.
6. Use `viewsPerSubscriber` only as size context for the same platform/entity; it is not conversion or audience quality.
7. For market context, optionally cross-check relevant search demand with `yaai_analyze_latest` and Yandex competitive search context with `yaai_serp_evidence`.
8. Recommend the smallest next research action: inspect a recurring entity, collect a second snapshot, add another source adapter, or analyze a specific content pattern.

## Output

Return:

1. **Recurring entities** — who repeatedly appears across the selected topics.
2. **Topic/content map** — which collected items correspond to which queries.
3. **Observed counters** — views/likes/comments/etc. exactly as present in evidence.
4. **Movement** — only where repeated snapshots exist.
5. **Research opportunities** — hypotheses clearly separated from measured evidence.

## Guardrails

- Never compare raw views/likes/forwards/reactions across different platforms as a universal effectiveness score.
- Never call search-selected items a representative channel baseline.
- Never infer conversions, revenue, audience quality or causal placement lift from public counters alone.
- Treat YouTube subscriber counts as rounded public counters, not exact audience size.
- Never trigger live platform collection through MCP.
- Label measured evidence separately from inference.
