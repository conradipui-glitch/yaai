import { validateDistributionDataset } from './source-adapter.mjs';

function latestSnapshots(dataset) {
  const grouped = new Map();
  for (const snapshot of dataset.metricsSnapshots || []) {
    const list = grouped.get(snapshot.contentId) || [];
    list.push(snapshot);
    grouped.set(snapshot.contentId, list);
  }

  const result = new Map();
  for (const [contentId, list] of grouped) {
    list.sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));
    result.set(contentId, {
      previous: list.length > 1 ? list.at(-2) : null,
      latest: list.at(-1),
      snapshotCount: list.length,
    });
  }
  return result;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metricsDelta(previous, latest) {
  if (!previous || !latest) return null;
  const keys = new Set([
    ...Object.keys(previous.metrics || {}),
    ...Object.keys(latest.metrics || {}),
  ]);
  const delta = {};
  for (const key of keys) {
    const before = Number(previous.metrics?.[key]);
    const after = Number(latest.metrics?.[key]);
    if (Number.isFinite(before) && Number.isFinite(after)) delta[key] = after - before;
  }
  return Object.keys(delta).length ? delta : null;
}

export function analyzeDistributionEvidence(dataset) {
  validateDistributionDataset(dataset);

  const entities = new Map((dataset.entities || []).map((entity) => [entity.id, entity]));
  const snapshots = latestSnapshots(dataset);
  const entityGroups = new Map();
  const contentRows = [];

  for (const item of dataset.contentItems || []) {
    const owner = entities.get(item.entityId);
    const snapshot = snapshots.get(item.id) || { latest: null, previous: null, snapshotCount: 0 };
    const queries = (item.discoveredBy || [])
      .filter((entry) => entry.type === 'query')
      .map((entry) => entry.value);

    const row = {
      ...item,
      entity: owner || null,
      queries,
      latestMetrics: snapshot.latest?.metrics || {},
      observedAt: snapshot.latest?.observedAt || null,
      metricDelta: metricsDelta(snapshot.previous, snapshot.latest),
      metricSnapshotCount: snapshot.snapshotCount,
    };
    contentRows.push(row);

    const group = entityGroups.get(item.entityId) || {
      entity: owner,
      content: [],
      queries: new Set(),
    };
    group.content.push(row);
    for (const query of queries) group.queries.add(query);
    entityGroups.set(item.entityId, group);
  }

  const entityRows = [...entityGroups.values()].map((group) => {
    const viewValues = group.content
      .map((item) => Number(item.latestMetrics?.views))
      .filter(Number.isFinite);
    const sampleMedianViews = median(viewValues);

    const ranked = group.content
      .map((item) => {
        const views = Number(item.latestMetrics?.views);
        const sampleRelativeReach = Number.isFinite(views)
          && sampleMedianViews != null
          && sampleMedianViews > 0
          && group.content.length >= 3
          ? Math.round((views / sampleMedianViews) * 100) / 100
          : null;
        return { ...item, sampleRelativeReach };
      })
      .sort((a, b) => Number(b.latestMetrics?.views || 0) - Number(a.latestMetrics?.views || 0));

    return {
      entity: group.entity,
      queryCount: group.queries.size,
      queries: [...group.queries],
      contentCount: group.content.length,
      sampleMedianViews,
      topContent: ranked.slice(0, 5).map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        publishedAt: item.publishedAt,
        views: item.latestMetrics?.views ?? null,
        likes: item.latestMetrics?.likes ?? null,
        comments: item.latestMetrics?.comments ?? null,
        sampleRelativeReach: item.sampleRelativeReach,
        queries: item.queries,
      })),
    };
  }).sort((a, b) =>
    b.queryCount - a.queryCount
    || b.contentCount - a.contentCount
    || Number(b.sampleMedianViews || 0) - Number(a.sampleMedianViews || 0)
    || String(a.entity?.name || '').localeCompare(String(b.entity?.name || ''))
  );

  contentRows.sort((a, b) =>
    Number(b.latestMetrics?.views || 0) - Number(a.latestMetrics?.views || 0)
    || String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
  );

  const multiSnapshotContent = contentRows.filter((row) => row.metricSnapshotCount > 1);

  return {
    meta: {
      source: dataset.source,
      platform: dataset.platform,
      generatedAt: dataset.generatedAt,
      queryCount: Array.isArray(dataset.queries) ? dataset.queries.length : 0,
      entityCount: dataset.entities.length,
      contentCount: dataset.contentItems.length,
      metricsSnapshotCount: dataset.metricsSnapshots.length,
      multiSnapshotContentCount: multiSnapshotContent.length,
      note: 'Metrics are observed platform counters. sampleRelativeReach compares collected items only within the same entity and is not cross-platform effectiveness, causal lift, or audience quality.',
    },
    entities: entityRows,
    content: contentRows,
  };
}
