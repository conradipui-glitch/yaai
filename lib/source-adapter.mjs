const ENTITY_TYPES = new Set(['company', 'creator', 'channel', 'publication', 'community', 'unknown']);

function clean(value) {
  return String(value ?? '').trim();
}

function required(value, label) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function timestamp(value, label) {
  const raw = required(value, label);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid timestamp.`);
  return date.toISOString();
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeMetrics(metrics = {}) {
  const normalizedMetrics = {};
  for (const [key, raw] of Object.entries(metrics || {})) {
    const value = numberOrNull(raw);
    if (value != null) normalizedMetrics[key] = value;
  }
  return normalizedMetrics;
}

export function scopedSourceId(platform, type, externalId) {
  return [
    required(platform, 'platform').toLowerCase(),
    required(type, 'type').toLowerCase(),
    required(externalId, 'externalId'),
  ].join(':');
}

export function createEntity({
  platform,
  externalId,
  type = 'unknown',
  name = '',
  url = '',
  handle = '',
  description = '',
} = {}) {
  const normalizedPlatform = required(platform, 'platform').toLowerCase();
  const normalizedType = required(type, 'entity type').toLowerCase();
  if (!ENTITY_TYPES.has(normalizedType)) throw new Error(`Unsupported entity type: ${normalizedType}`);
  const sourceId = required(externalId, 'entity externalId');

  return {
    id: scopedSourceId(normalizedPlatform, normalizedType, sourceId),
    platform: normalizedPlatform,
    type: normalizedType,
    externalId: sourceId,
    name: clean(name) || sourceId,
    url: clean(url),
    handle: clean(handle) || null,
    description: clean(description) || null,
  };
}

export function createContentItem({
  platform,
  externalId,
  type = 'post',
  entityId,
  url,
  title = '',
  text = '',
  publishedAt,
  discoveredBy = [],
  outboundLinks = [],
} = {}) {
  const normalizedPlatform = required(platform, 'platform').toLowerCase();
  const normalizedType = required(type, 'content type').toLowerCase();
  const sourceId = required(externalId, 'content externalId');
  const owner = required(entityId, 'entityId');

  const discovery = [...new Map((discoveredBy || [])
    .map((item) => {
      const discoveryType = clean(item?.type).toLowerCase();
      const value = clean(item?.value);
      if (!discoveryType || !value) return null;
      return [`${discoveryType}|${value.toLowerCase()}`, { type: discoveryType, value }];
    })
    .filter(Boolean)).values()];

  const links = [...new Set((outboundLinks || []).map(clean).filter(Boolean))];

  return {
    id: scopedSourceId(normalizedPlatform, normalizedType, sourceId),
    platform: normalizedPlatform,
    type: normalizedType,
    externalId: sourceId,
    entityId: owner,
    url: required(url, 'content url'),
    title: clean(title),
    text: clean(text),
    publishedAt: publishedAt ? timestamp(publishedAt, 'publishedAt') : null,
    discoveredBy: discovery,
    outboundLinks: links,
  };
}

export function createMetricsSnapshot({
  platform,
  contentId,
  observedAt,
  metrics = {},
} = {}) {
  const normalizedPlatform = required(platform, 'platform').toLowerCase();
  const normalizedContentId = required(contentId, 'contentId');

  return {
    platform: normalizedPlatform,
    contentId: normalizedContentId,
    observedAt: timestamp(observedAt, 'observedAt'),
    metrics: normalizeMetrics(metrics),
  };
}

export function createEntityMetricsSnapshot({
  platform,
  entityId,
  observedAt,
  metrics = {},
} = {}) {
  const normalizedPlatform = required(platform, 'platform').toLowerCase();
  const normalizedEntityId = required(entityId, 'entityId');

  return {
    platform: normalizedPlatform,
    entityId: normalizedEntityId,
    observedAt: timestamp(observedAt, 'observedAt'),
    metrics: normalizeMetrics(metrics),
  };
}

export function createDistributionDataset({
  source,
  platform,
  generatedAt,
  queries = [],
  entities = [],
  contentItems = [],
  metricsSnapshots = [],
  entityMetricsSnapshots = [],
  sourceMeta = {},
} = {}) {
  const dataset = {
    schemaVersion: 1,
    source: required(source, 'source'),
    platform: required(platform, 'platform').toLowerCase(),
    generatedAt: timestamp(generatedAt || new Date().toISOString(), 'generatedAt'),
    queries: [...new Set((queries || []).map(clean).filter(Boolean))],
    entities,
    contentItems,
    metricsSnapshots,
    entityMetricsSnapshots,
    sourceMeta: sourceMeta && typeof sourceMeta === 'object' ? sourceMeta : {},
  };
  validateDistributionDataset(dataset);
  return dataset;
}

export function validateDistributionDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') throw new Error('Distribution dataset must be an object.');
  if (Number(dataset.schemaVersion) !== 1) throw new Error('Unsupported distribution dataset schemaVersion.');
  required(dataset.source, 'dataset source');
  const platform = required(dataset.platform, 'dataset platform').toLowerCase();
  timestamp(dataset.generatedAt, 'dataset generatedAt');

  for (const field of ['entities', 'contentItems', 'metricsSnapshots']) {
    if (!Array.isArray(dataset[field])) throw new Error(`Distribution dataset must contain ${field} array.`);
  }
  if (dataset.entityMetricsSnapshots != null && !Array.isArray(dataset.entityMetricsSnapshots)) {
    throw new Error('Distribution dataset entityMetricsSnapshots must be an array when present.');
  }

  const entityIds = new Set();
  for (const entity of dataset.entities) {
    const id = required(entity?.id, 'entity id');
    if (entityIds.has(id)) throw new Error(`Duplicate entity id: ${id}`);
    if (clean(entity?.platform).toLowerCase() !== platform) {
      throw new Error(`Entity platform mismatch: ${id}`);
    }
    entityIds.add(id);
  }

  const contentIds = new Set();
  for (const item of dataset.contentItems) {
    const id = required(item?.id, 'content id');
    if (contentIds.has(id)) throw new Error(`Duplicate content id: ${id}`);
    if (!entityIds.has(item.entityId)) throw new Error(`Unknown entityId for content ${id}: ${item.entityId}`);
    if (clean(item?.platform).toLowerCase() !== platform) {
      throw new Error(`Content platform mismatch: ${id}`);
    }
    contentIds.add(id);
  }

  for (const snapshot of dataset.metricsSnapshots) {
    if (!contentIds.has(snapshot?.contentId)) {
      throw new Error(`Unknown contentId in metrics snapshot: ${snapshot?.contentId || '(empty)'}`);
    }
    if (clean(snapshot?.platform).toLowerCase() !== platform) {
      throw new Error(`Metrics platform mismatch: ${snapshot?.contentId}`);
    }
    timestamp(snapshot?.observedAt, 'metrics observedAt');
  }

  for (const snapshot of dataset.entityMetricsSnapshots || []) {
    if (!entityIds.has(snapshot?.entityId)) {
      throw new Error(`Unknown entityId in entity metrics snapshot: ${snapshot?.entityId || '(empty)'}`);
    }
    if (clean(snapshot?.platform).toLowerCase() !== platform) {
      throw new Error(`Entity metrics platform mismatch: ${snapshot?.entityId}`);
    }
    timestamp(snapshot?.observedAt, 'entity metrics observedAt');
  }

  return true;
}
