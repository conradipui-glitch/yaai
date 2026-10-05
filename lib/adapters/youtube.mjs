import {
  createContentItem,
  createDistributionDataset,
  createEntity,
  createEntityMetricsSnapshot,
  createMetricsSnapshot,
} from '../source-adapter.mjs';

function videoId(item) {
  if (typeof item?.id === 'string') return item.id;
  return String(item?.id?.videoId || '').trim();
}

function channelId(item) {
  return String(item?.id || '').trim();
}

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function channelEntity(id, channel = {}, fallbackTitle = '') {
  const snippet = channel?.snippet || {};
  return createEntity({
    platform: 'youtube',
    type: 'channel',
    externalId: id,
    name: snippet.title || fallbackTitle || id,
    url: `https://www.youtube.com/channel/${id}`,
    handle: snippet.customUrl || '',
    description: snippet.description || '',
  });
}

export function buildYouTubeDistributionDataset({
  generatedAt = new Date().toISOString(),
  searchPages = [],
  videos = [],
  channels = [],
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

  const channelsById = new Map(
    (channels || [])
      .map((item) => [channelId(item), item])
      .filter(([id]) => id),
  );

  const entities = new Map();
  const contentItems = [];
  const metricsSnapshots = [];
  const entityMetricsSnapshots = [];

  for (const item of videos || []) {
    const id = videoId(item);
    const snippet = item?.snippet || {};
    const ownerId = String(snippet.channelId || '').trim();
    if (!id || !ownerId) continue;

    const channel = channelsById.get(ownerId) || {};
    const entity = channelEntity(ownerId, channel, snippet.channelTitle);
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

  for (const entity of entities.values()) {
    const channel = channelsById.get(entity.externalId);
    if (!channel) continue;
    const stats = channel?.statistics || {};
    entityMetricsSnapshots.push(createEntityMetricsSnapshot({
      platform: 'youtube',
      entityId: entity.id,
      observedAt: generatedAt,
      metrics: {
        subscribers: stats.hiddenSubscriberCount === true ? null : integer(stats.subscriberCount),
        totalViews: integer(stats.viewCount),
        publicVideos: integer(stats.videoCount),
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
    entityMetricsSnapshots,
    sourceMeta: {
      regionCode: String(regionCode || '').trim() || null,
      relevanceLanguage: String(relevanceLanguage || '').trim() || null,
      searchPages: searchPages.length,
      collectedVideos: contentItems.length,
      collectedChannels: entityMetricsSnapshots.length,
      note: 'YouTube search discovery plus public video/channel statistics. Subscriber counts are rounded by YouTube when public. Search-selected content is not a representative channel sample.',
    },
  });
}
