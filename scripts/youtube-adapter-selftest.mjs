import assert from 'node:assert/strict';

import { buildYouTubeDistributionDataset } from '../lib/adapters/youtube.mjs';

const dataset = buildYouTubeDistributionDataset({
  generatedAt: '2026-10-05T08:00:00.000Z',
  regionCode: 'RU',
  relevanceLanguage: 'ru',
  searchPages: [
    {
      query: 'ai отдел продаж',
      items: [
        { id: { videoId: 'v1' } },
        { id: { videoId: 'v2' } },
      ],
    },
    {
      query: 'автоматизация лидов',
      items: [
        { id: { videoId: 'v2' } },
      ],
    },
  ],
  videos: [
    {
      id: 'v1',
      snippet: {
        channelId: 'c1',
        channelTitle: 'Channel One',
        title: 'AI для продаж',
        description: 'Описание первого ролика',
        publishedAt: '2026-10-01T10:00:00Z',
      },
      statistics: { viewCount: '1000', likeCount: '50', commentCount: '10' },
    },
    {
      id: 'v2',
      snippet: {
        channelId: 'c1',
        channelTitle: 'Channel One',
        title: 'Автоматизация лидов',
        description: 'Описание второго ролика',
        publishedAt: '2026-10-02T10:00:00Z',
      },
      statistics: { viewCount: '2000', likeCount: '80', commentCount: '15' },
    },
  ],
});

assert.equal(dataset.platform, 'youtube');
assert.equal(dataset.entities.length, 1);
assert.equal(dataset.contentItems.length, 2);
assert.equal(dataset.metricsSnapshots.length, 2);
assert.equal(dataset.queries.length, 2);

const v2 = dataset.contentItems.find((item) => item.externalId === 'v2');
assert.deepEqual(
  v2.discoveredBy.map((item) => item.value).sort(),
  ['ai отдел продаж', 'автоматизация лидов'].sort(),
);
assert.equal(dataset.metricsSnapshots.find((row) => row.contentId === v2.id).metrics.views, 2000);

console.log('youtube adapter selftest: ok');
