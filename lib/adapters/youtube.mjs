import {
  createContentItem,
  createDistributionDataset,
  createEntity,
  createMetricsSnapshot,
} from '../source-adapter.mjs';

function videoId(item) {
  if (typeof item?.id === 'string') return item.id;
  return String(item?.id?.videoId || '').trim();
}

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function channelEntity(channelId, title = '') {
  return createEntity({
    platform: 'youtube',
    type: 'channel',
    externalId: channelId,
    name: title || channelId,
    url: `https://www.youtube.com/channel/${channelId}`,
  });
}

export function buildYouTubeDistributionDataset({
  generatedAt = new Date().toISOString(),
  searchPages = [],
  videos = [],
  regionCode = '',
  relevanceLanguage = '',
} = {}) {
  const discoveryByVideo = new Map();
  const queries = [];

  for (const page of searchPages || []) {
    const query = String(page?.query || '').trim();
    if (query && !queries.includes(query)) queries.push(query);

    for (const item of page?.items || []) {
      const id = videoId(item);
      if (!id || !query) continue;
      const found = discoveryByVideo.get(id) || [];
      if (!found.some((entry) => entry.type === 'query' && entry.value === query)) {
        found.push({ type: 'query', value: query });
      }
      discoveryByVideo.set(id, found);
    }
  }

  const entities = new Map();
  const contentItems = [];
  const metricsSnapshots = [];

  for (const item of videos || []) {
    const id = videoId(item);
    const snippet = item?.snippet || {};
    const channelId = String(snippet.channelId || '').trim();
    if (!id || !channelId) continue;

    const entity = channelEntity(channelId, snippet.channelTitle);
    if (!entities.has(entity.id)) entities.set(entity.id, entity);

    const content = createContentItem({
      platform: 'youtube',
      type: 'video',
      externalId: id,
      entityId: entity.id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: snippet.title,
      text: snippet.description,
      publishedAt: snippet.publishedAt || null,
      discoveredBy: discoveryByVideo.get(id) || [],
    });
    contentItems.push(content);

    const stats = item?.statistics || {};
    metricsSnapshots.push(createMetricsSnapshot({
      platform: 'youtube',
      contentId: content.id,
      observedAt: generatedAt,
      metrics: {
        views: integer(stats.viewCount),
        likes: integer(stats.likeCount),
        comments: integer(stats.commentCount),
      },
    }));
  }

  return createDistributionDataset({
    source: 'youtube-data-api-v3',
    platform: 'youtube',
    generatedAt,
    queries,
    entities: [...entities.values()],
    contentItems,
    metricsSnapshots,
    sourceMeta: {
      regionCode: String(regionCode || '').trim() || null,
      relevanceLanguage: String(relevanceLanguage || '').trim() || null,
      searchPages: searchPages.length,
      collectedVideos: contentItems.length,
      note: 'YouTube search discovery plus public video snippet/statistics. Search-selected content is not a representative channel sample.',
    },
  });
}
