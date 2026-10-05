import { validateDistributionDataset } from './source-adapter.mjs';

function snapshotIndex(rows = [], keyField) {
  const grouped = new Map();
  for (const snapshot of rows || []) {
    const key = snapshot?.[keyField];
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(snapshot);
    grouped.set(key, list);
  }

  const result = new Map();
  for (const [key, list] of grouped) {
    list.sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));
    result.set(key, {
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

function ratio(numerator, denominator) {
  const a = Number(numerator);
  const b = Number(denominator);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((a / b) * 100) / 100;
}

export function analyzeDistributionEvidence(dataset) {
  validateDistributionDataset(dataset);

  const entities = new Map((dataset.entities || []).map((entity) => [entity.id, entity]));
  const contentSnapshots = snapshotIndex(dataset.metricsSnapshots || [], 'contentId');
  const entitySnapshots = snapshotIndex(dataset.entityMetricsSnapshots || [], 'entityId');
  const entityGroups = new Map();
  const contentRows = [];

  for (const item of dataset.contentItems || []) {
    const owner = entities.get(item.entityId);
    const snapshot = contentSnapshots.get(item.id) || { latest: null, previous: null, snapshotCount: 0 };
    const ownerSnapshot = entitySnapshots.get(item.entityId) || { latest: null, previous: null, snapshotCount: 0 };
    const queries = (item.discoveredBy || [])
      .filter((entry) => entry.type === 'query')
      .map((entry) => entry.value);

    const views = snapshot.latest?.metrics?.views;
    const subscribers = ownerSnapshot.latest?.metrics?.subscribers;

    const row = {
      ...item,
      entity: owner || null,
      queries,
      latestMetrics: snapshot.latest?.metrics || {},
      observedAt: snapshot.latest?.observedAt || null,
      metricDelta: metricsDelta(snapshot.previous, snapshot.latest),
      metricSnapshotCount: snapshot.snapshotCount,
      entityLatestMetrics: ownerSnapshot.latest?.metrics || {},
      entityObservedAt: ownerSnapshot.latest?.observedAt || null,
      viewsPerSubscriber: ratio(views, subscribers),
    };
    contentRows.push(row);

    const group = entityGroups.get(item.entityId) || {
      entity: owner,
      content: [],
      queries: new Set(),
      entitySnapshot: ownerSnapshot,
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
    const latestEntityMetrics = group.entitySnapshot.latest?.metrics || {};

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
      latestMetrics: latestEntityMetrics,
      observedAt: group.entitySnapshot.latest?.observedAt || null,
      metricDelta: metricsDelta(group.entitySnapshot.previous, group.entitySnapshot.latest),
      metricSnapshotCount: group.entitySnapshot.snapshotCount,
      sampleMedianViews,
      topContent: ranked.slice(0, 5).map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        publishedAt: item.publishedAt,
        metrics: item.latestMetrics,
        views: item.latestMetrics?.views ?? null,
        likes: item.latestMetrics?.likes ?? null,
        comments: item.latestMetrics?.comments ?? null,
        forwards: item.latestMetrics?.forwards ?? null,
        reactions: item.latestMetrics?.reactions ?? null,
        sampleRelativeReach: item.sampleRelativeReach,
        viewsPerSubscriber: item.viewsPerSubscriber,
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
  const multiSnapshotEntities = entityRows.filter((row) => row.metricSnapshotCount > 1);

  return {
    meta: {
      source: dataset.source,
      platform: dataset.platform,
      generatedAt: dataset.generatedAt,
      queryCount: Array.isArray(dataset.queries) ? dataset.queries.length : 0,
      entityCount: dataset.entities.length,
      contentCount: dataset.contentItems.length,
      metricsSnapshotCount: dataset.metricsSnapshots.length,
      entityMetricsSnapshotCount: (dataset.entityMetricsSnapshots || []).length,
      multiSnapshotContentCount: multiSnapshotContent.length,
      multiSnapshotEntityCount: multiSnapshotEntities.length,
      note: 'Metrics are observed platform counters. sampleRelativeReach compares collected items only within the same entity. viewsPerSubscriber is contextual size-normalization, not conversion, audience quality, or causal effectiveness.',
    },
    entities: entityRows,
    content: contentRows,
  };
}
