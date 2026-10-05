import assert from 'node:assert/strict';

import { analyzeDistributionEvidence } from '../lib/distribution-evidence.mjs';
import {
  createContentItem,
  createDistributionDataset,
  createEntity,
  createMetricsSnapshot,
} from '../lib/source-adapter.mjs';

const entity = createEntity({
  platform: 'youtube',
  type: 'channel',
  externalId: 'c1',
  name: 'Demo Channel',
  url: 'https://www.youtube.com/channel/c1',
});

const content = [
  ['v1', 'Video 1', 1000],
  ['v2', 'Video 2', 2000],
  ['v3', 'Video 3', 4000],
].map(([id, title]) => createContentItem({
  platform: 'youtube',
  type: 'video',
  externalId: id,
  entityId: entity.id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title,
  publishedAt: '2026-10-01T10:00:00Z',
  discoveredBy: [{ type: 'query', value: id === 'v3' ? 'query two' : 'query one' }],
}));

const snapshots = [];
for (const [index, item] of content.entries()) {
  snapshots.push(createMetricsSnapshot({
    platform: 'youtube',
    contentId: item.id,
    observedAt: '2026-10-05T08:00:00Z',
    metrics: {
      views: [1000, 2000, 4000][index],
      likes: [50, 70, 100][index],
      comments: [5, 7, 10][index],
    },
  }));
}
snapshots.push(createMetricsSnapshot({
  platform: 'youtube',
  contentId: content[0].id,
  observedAt: '2026-10-06T08:00:00Z',
  metrics: { views: 1300, likes: 60, comments: 8 },
}));

const dataset = createDistributionDataset({
  source: 'test',
  platform: 'youtube',
  generatedAt: '2026-10-06T08:00:00Z',
  queries: ['query one', 'query two'],
  entities: [entity],
  contentItems: content,
  metricsSnapshots: snapshots,
});

const analysis = analyzeDistributionEvidence(dataset);
assert.equal(analysis.meta.entityCount, 1);
assert.equal(analysis.meta.contentCount, 3);
assert.equal(analysis.meta.metricsSnapshotCount, 4);
assert.equal(analysis.meta.multiSnapshotContentCount, 1);
assert.equal(analysis.entities[0].queryCount, 2);
assert.equal(analysis.entities[0].sampleMedianViews, 2000);

const top = analysis.entities[0].topContent[0];
assert.equal(top.id, content[2].id);
assert.equal(top.sampleRelativeReach, 2);

const updated = analysis.content.find((item) => item.id === content[0].id);
assert.equal(updated.latestMetrics.views, 1300);
assert.equal(updated.metricDelta.views, 300);
assert.equal(updated.metricDelta.comments, 3);

console.log('distribution evidence selftest: ok');
