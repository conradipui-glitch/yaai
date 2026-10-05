import assert from 'node:assert/strict';

import { buildTelegramDistributionDataset, telegramPublicUrl } from '../lib/adapters/telegram.mjs';
import { analyzeDistributionEvidence } from '../lib/distribution-evidence.mjs';

const dataset = buildTelegramDistributionDataset({
  generatedAt: '2026-10-05T12:00:00.000Z',
  researchQueries: ['AI заработок', 'автоматизация бизнеса'],
  channelBundles: [
    {
      channel: {
        id: '1001',
        username: 'demo_ai',
        title: 'Demo AI',
        description: 'AI channel',
        subscribers: 12000,
        online: 350,
      },
      posts: [
        {
          id: '101',
          text: 'Первый пост https://example.com/offer',
          publishedAt: '2026-10-04T10:00:00Z',
          views: 25000,
          forwards: 420,
          reactions: 1300,
          comments: 95,
          outboundLinks: ['https://example.com/offer'],
        },
        {
          id: '102',
          text: 'Второй пост',
          publishedAt: '2026-10-05T10:00:00Z',
          views: 5000,
          forwards: 50,
          reactions: 210,
          comments: 12,
          outboundLinks: [],
        },
      ],
    },
  ],
});

assert.equal(dataset.platform, 'telegram');
assert.equal(dataset.entities.length, 1);
assert.equal(dataset.contentItems.length, 2);
assert.equal(dataset.metricsSnapshots.length, 2);
assert.equal(dataset.entityMetricsSnapshots.length, 1);
assert.equal(dataset.entityMetricsSnapshots[0].metrics.subscribers, 12000);
assert.equal(dataset.metricsSnapshots[0].metrics.forwards, 420);
assert.equal(dataset.metricsSnapshots[0].metrics.reactions, 1300);
assert.equal(dataset.metricsSnapshots[0].metrics.comments, 95);
assert.equal(dataset.contentItems[0].url, 'https://t.me/demo_ai/101');
assert.deepEqual(dataset.contentItems[0].outboundLinks, ['https://example.com/offer']);
assert.deepEqual(
  dataset.contentItems[0].discoveredBy.filter((x) => x.type === 'query').map((x) => x.value),
  ['AI заработок', 'автоматизация бизнеса'],
);
assert.equal(telegramPublicUrl('@demo_ai'), 'https://t.me/demo_ai');

const analysis = analyzeDistributionEvidence(dataset);
assert.equal(analysis.entities[0].latestMetrics.subscribers, 12000);
assert.equal(analysis.entities[0].topContent[0].forwards, 420);
assert.equal(analysis.entities[0].topContent[0].reactions, 1300);
assert.equal(analysis.entities[0].topContent[0].metrics.comments, 95);
assert.equal(analysis.entities[0].topContent[0].viewsPerSubscriber, 2.08);

console.log('telegram adapter selftest: ok');
