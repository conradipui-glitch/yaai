import {
  createContentItem,
  createDistributionDataset,
  createEntity,
  createEntityMetricsSnapshot,
  createMetricsSnapshot,
} from '../source-adapter.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function telegramPublicUrl(username, messageId = null) {
  const normalized = clean(username).replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').replace(/\/$/, '');
  if (!normalized) return '';
  return messageId == null
    ? `https://t.me/${normalized}`
    : `https://t.me/${normalized}/${messageId}`;
}

export function buildTelegramDistributionDataset({
  generatedAt = new Date().toISOString(),
  researchQueries = [],
  channelBundles = [],
  source = 'telegram-mtproto-teleproto',
} = {}) {
  const entities = [];
  const contentItems = [];
  const metricsSnapshots = [];
  const entityMetricsSnapshots = [];

  for (const bundle of channelBundles || []) {
    const channel = bundle?.channel || {};
    const externalId = clean(channel.id);
    const username = clean(channel.username).replace(/^@/, '');
    if (!externalId || !username) continue;

    const entity = createEntity({
      platform: 'telegram',
      type: 'channel',
      externalId,
      name: clean(channel.title) || username,
      url: telegramPublicUrl(username),
      handle: `@${username}`,
      description: clean(channel.description),
    });
    entities.push(entity);

    entityMetricsSnapshots.push(createEntityMetricsSnapshot({
      platform: 'telegram',
      entityId: entity.id,
      observedAt: generatedAt,
      metrics: {
        subscribers: numberOrNull(channel.subscribers),
        online: numberOrNull(channel.online),
      },
    }));

    for (const post of bundle?.posts || []) {
      const postId = clean(post.id);
      if (!postId) continue;
      const discoveredBy = [
        { type: 'channel', value: `@${username}` },
        ...(researchQueries || []).map((query) => ({ type: 'query', value: clean(query) })).filter((x) => x.value),
      ];

      const item = createContentItem({
        platform: 'telegram',
        type: 'post',
        externalId: `${externalId}:${postId}`,
        entityId: entity.id,
        url: telegramPublicUrl(username, postId),
        title: clean(post.title),
        text: clean(post.text),
        publishedAt: isoDate(post.publishedAt),
        discoveredBy,
        outboundLinks: Array.isArray(post.outboundLinks) ? post.outboundLinks : [],
      });
      contentItems.push(item);

      metricsSnapshots.push(createMetricsSnapshot({
        platform: 'telegram',
        contentId: item.id,
        observedAt: generatedAt,
        metrics: {
          views: numberOrNull(post.views),
          forwards: numberOrNull(post.forwards),
          reactions: numberOrNull(post.reactions),
          comments: numberOrNull(post.comments),
        },
      }));
    }
  }

  return createDistributionDataset({
    source,
    platform: 'telegram',
    generatedAt,
    queries: (researchQueries || []).map(clean).filter(Boolean),
    entities,
    contentItems,
    metricsSnapshots,
    entityMetricsSnapshots,
    sourceMeta: {
      collectedChannels: entities.length,
      collectedPosts: contentItems.length,
      note: 'Public Telegram channel/post evidence collected through an authenticated MTProto user session. Public counters are observations, not conversion or causal placement effectiveness.',
    },
  });
}
