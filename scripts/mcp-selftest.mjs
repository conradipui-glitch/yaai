import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MODERN_PROTOCOL_VERSION,
  TOOLS,
  createMcpContext,
  handleRpcMessage,
} from '../mcp-server.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-mcp-'));
const dirs = ['cases', 'presets', 'planners', 'results', 'snapshots'];
for (const dir of dirs) await fs.mkdir(path.join(root, dir), { recursive: true });

const caseConfig = {
  id: 'demo-seo',
  name: 'Demo SEO',
  resultPrefix: 'demo',
  regions: [{ id: '1', name: 'Demo Region' }],
  seeds: ['баня'],
};
const preset = {
  id: 'demo',
  name: 'Demo preset',
  negativeKeywords: [],
  queryClassification: {
    commercialKeywords: ['купить', 'цена'],
    informationalKeywords: ['как'],
    commercialHeadKeywords: ['бан*'],
    commercialHeadMaxWords: 4,
  },
  intents: [
    {
      id: 'B01',
      cluster: 'Бани',
      title: 'Купить баню',
      priority: 'P1',
      queryType: 'commercial',
      keywords: ['бан*'],
    },
  ],
};
const planner = {
  defaultFocusWeight: 1,
  nowCount: 5,
  nextCount: 10,
  targets: [
    {
      id: 'bath-main',
      title: 'Бани',
      kind: 'landing',
      status: 'existing',
      mode: 'primary',
      path: '/bani/',
      priority: 'P1',
      focusWeight: 3,
      intentIds: ['B01'],
    },
  ],
};
const latestWordstat = {
  generatedAt: '2026-09-29T12:00:00.000Z',
  rows: [
    {
      phrase: 'купить баню',
      regionId: '1',
      regionName: 'Demo Region',
      count: 100,
      types: ['top'],
      seeds: ['баня'],
    },
    {
      phrase: 'как выбрать баню',
      regionId: '1',
      regionName: 'Demo Region',
      count: 40,
      types: ['top'],
      seeds: ['баня'],
    },
  ],
};

await fs.writeFile(path.join(root, 'cases', 'demo-seo.json'), JSON.stringify(caseConfig));
await fs.writeFile(path.join(root, 'presets', 'demo.json'), JSON.stringify(preset));
await fs.writeFile(path.join(root, 'planners', 'demo.json'), JSON.stringify(planner));
await fs.writeFile(path.join(root, 'results', 'demo-wordstat-latest.json'), JSON.stringify(latestWordstat));
await fs.writeFile(
  path.join(root, 'webmaster.csv'),
  'date,query,url,impressions,clicks,position\n2026-09-28,баня,/a,80,8,9\n2026-09-28,баня,/b,40,3,12\n2026-09-29,баня,/a,100,10,5\n2026-09-29,баня,/b,50,4,8\n',
);
await fs.writeFile(
  path.join(root, 'serp.json'),
  JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-10-02T07:00:00.000Z',
    source: 'yandex-search-api-v2',
    region: '66',
    ownDomain: 'demo.example',
    queries: [
      {
        query: 'купить баню',
        results: [
          { position: 1, url: 'https://competitor.example/bani/', domain: 'competitor.example', title: 'Бани' },
          { position: 2, url: 'https://demo.example/bani/', domain: 'demo.example', title: 'Demo' },
        ],
      },
      {
        query: 'баня омск',
        results: [
          { position: 1, url: 'https://competitor.example/omsk/', domain: 'competitor.example', title: 'Бани Омск' },
        ],
      },
    ],
  }),
);
await fs.writeFile(
  path.join(root, 'distribution.json'),
  JSON.stringify({
    schemaVersion: 1,
    source: 'youtube-data-api-v3',
    platform: 'youtube',
    generatedAt: '2026-10-05T08:00:00.000Z',
    queries: ['баня'],
    entities: [
      {
        id: 'youtube:channel:c1',
        platform: 'youtube',
        type: 'channel',
        externalId: 'c1',
        name: 'Demo Channel',
        url: 'https://www.youtube.com/channel/c1',
        handle: null,
        description: null,
      },
    ],
    contentItems: [
      {
        id: 'youtube:video:v1',
        platform: 'youtube',
        type: 'video',
        externalId: 'v1',
        entityId: 'youtube:channel:c1',
        url: 'https://www.youtube.com/watch?v=v1',
        title: 'Баня под ключ',
        text: 'Видео про готовые бани',
        publishedAt: '2026-10-01T08:00:00.000Z',
        discoveredBy: [{ type: 'query', value: 'баня' }],
        outboundLinks: [],
      },
    ],
    metricsSnapshots: [
      {
        platform: 'youtube',
        contentId: 'youtube:video:v1',
        observedAt: '2026-10-05T08:00:00.000Z',
        metrics: { views: 1000, likes: 50, comments: 10 },
      },
    ],
    sourceMeta: {},
  }),
);
await fs.writeFile(
  path.join(root, 'evaluation.json'),
  JSON.stringify({
    schemaVersion: 1,
    source: 'openrouter-decisions',
    generatedAt: '2026-10-05T12:00:00.000Z',
    modelRequested: 'typesafe/jev-1.13',
    profile: {
      id: 'demo-eval',
      name: 'Demo evaluation',
      reviewThreshold: 0.8,
      questions: {
        fit: {
          type: 'choice',
          instructions: 'How well does this item fit?',
          criteria: { high: 'Strong fit', low: 'Weak fit' },
        },
      },
    },
    summary: {
      itemCount: 2,
      needsReviewCount: 1,
      totalCost: 0.00002,
      totalInputTokens: 500,
      totalOutputTokens: 20,
    },
    evaluations: [
      {
        itemId: 'item-1',
        meta: { source: 'demo' },
        stateHash: 'a'.repeat(64),
        model: 'typesafe/jev-1.13-test',
        provider: 'TypeSafe',
        answers: {
          fit: {
            type: 'choice',
            value: 'high',
            confidence: 0.95,
            certainty: 0.95,
            probabilities: { high: 0.97, low: 0.03 },
          },
        },
        route: { threshold: 0.8, needsReview: false, lowCertainty: [] },
        usage: { cost: 0.00001, inputTokens: 250, outputTokens: 10 },
      },
      {
        itemId: 'item-2',
        meta: { source: 'demo' },
        stateHash: 'b'.repeat(64),
        model: 'typesafe/jev-1.13-test',
        provider: 'TypeSafe',
        answers: {
          fit: {
            type: 'choice',
            value: 'low',
            confidence: 0.55,
            certainty: 0.55,
            probabilities: { high: 0.45, low: 0.55 },
          },
        },
        route: {
          threshold: 0.8,
          needsReview: true,
          lowCertainty: [{ id: 'fit', certainty: 0.55 }],
        },
        usage: { cost: 0.00001, inputTokens: 250, outputTokens: 10 },
      },
    ],
  }),
);

async function writeSnapshot(date, run, count, fingerprint = 'same') {
  const dir = path.join(root, 'snapshots', 'demo-seo', 'snapshots', date, run);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'wordstat.json'), JSON.stringify({
    rows: [{
      phrase: 'купить баню',
      regionId: '1',
      regionName: 'Demo Region',
      count,
      types: ['top'],
      seeds: ['баня'],
    }],
  }));
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    caseId: 'demo-seo',
    generatedAt: `${date}T${run.slice(0, 2)}:${run.slice(2, 4)}:${run.slice(4, 6)}.000Z`,
    caseFingerprint: fingerprint,
    files: { wordstatJson: 'wordstat.json' },
  }));
}

await writeSnapshot('2026-09-28', '120000Z', 50);
await writeSnapshot('2026-09-29', '120000Z', 100);

const context = createMcpContext({ workspaceRoot: root, caseId: 'demo-seo' });

await fs.writeFile(path.join(root, 'pain-map.json'), JSON.stringify({
  schemaVersion: 1,
  source: 'yaai-pain-discovery',
  topic: 'обработка заявок',
  summary: { painCategories: 1, acceptedEvidence: 2, rejectedEvidence: 1, uncertainEvidence: 0, measuredModelCostUsd: 0.00002 },
  methodology: ['Hypotheses, not verified customer complaints.'],
  cards: [{
    category: 'lost_opportunities',
    title: 'Потерянные заявки и возможности',
    status: 'hypothesis_requires_validation',
    searchPhraseCount: 1,
    snippetCount: 1,
    distinctSearchPages: 1,
    bestObservedWordstatCount: 220,
    needsReviewCount: 0,
    evidence: {
      wordstat: [{query:'не терять заявки',observedCount:220}],
      serp: [{title:'Клиенты уходят',url:'https://example.org/post/1',excerpt:'У нас теряются заявки'}],
    },
  }],
}));

const legacyState = {};
const initialized = await handleRpcMessage({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
}, legacyState, context);
assert.equal(initialized.result.protocolVersion, '2025-11-25');
assert.equal(initialized.result.serverInfo.name, 'yaai');

const legacyTools = await handleRpcMessage({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
}, legacyState, context);
assert.equal(legacyTools.result.tools.length, TOOLS.length);
assert.equal('resultType' in legacyTools.result, false);

const modernState = {};
const meta = {
  'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};
const discovered = await handleRpcMessage({
  jsonrpc: '2.0',
  id: 'discover',
  method: 'server/discover',
  params: { _meta: meta },
}, modernState, context);
assert.equal(discovered.result.resultType, 'complete');
assert.ok(discovered.result.supportedVersions.includes(MODERN_PROTOCOL_VERSION));

const modernTools = await handleRpcMessage({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/list',
  params: { _meta: meta },
}, modernState, context);
assert.equal(modernTools.result.resultType, 'complete');
assert.equal(modernTools.result.tools.length, TOOLS.length);

async function call(name, args = {}) {
  const response = await handleRpcMessage({
    jsonrpc: '2.0',
    id: name,
    method: 'tools/call',
    params: { name, arguments: args, _meta: meta },
  }, modernState, context);
  assert.equal(response.result.resultType, 'complete');
  assert.equal(response.result.isError, undefined, JSON.stringify(response.result.structuredContent));
  return response.result.structuredContent;
}

const overview = await call('yaai_workspace_overview');
assert.equal(overview.selectedCase.id, 'demo-seo');
assert.equal(overview.snapshotCount, 2);
assert.equal(overview.capabilities.rankTracker, true);
assert.equal(overview.capabilities.serpEvidence, true);
assert.equal(overview.capabilities.distributionEvidence, true);
assert.equal(overview.capabilities.evaluationEvidence, true);
assert.equal(overview.capabilities.painEvidence, true);
assert.equal(overview.capabilities.paidApiCallsFromMcp, false);

const analysis = await call('yaai_analyze_latest', { limit: 10 });
assert.equal(analysis.caseId, 'demo-seo');
assert.ok(analysis.meta.eligibleRows >= 2);
assert.ok(analysis.signals.some((item) => item.intentId === 'B01'));

const plan = await call('yaai_build_page_plan', { limit: 10 });
assert.equal(plan.pageCount, 1);
assert.equal(plan.pages[0].decision, 'expand');
assert.equal(plan.pages[0].path, '/bani/');

const comparison = await call('yaai_compare_snapshots', { limit: 10 });
assert.equal(comparison.comparable, true);
assert.equal(comparison.growth[0].previousCount, 50);
assert.equal(comparison.growth[0].currentCount, 100);

const overlap = await call('yaai_webmaster_overlap', {
  relativeCsvPath: 'webmaster.csv',
  minImpressions: 1,
  limit: 10,
});
assert.equal(overlap.candidateCount, 1);
assert.equal(overlap.overlaps[0].pages.length, 2);

const rank = await call('yaai_rank_tracker', {
  relativeCsvPath: 'webmaster.csv',
  minImpressions: 1,
  limit: 10,
});
assert.equal(rank.meta.currentDate, '2026-09-29');
assert.equal(rank.meta.previousDate, '2026-09-28');
assert.equal(rank.current.queryCount, 1);
assert.ok(rank.comparison.improvements.some((row) => row.query === 'баня'));

const serp = await call('yaai_serp_evidence', {
  relativeJsonPath: 'serp.json',
  ownDomain: 'demo.example',
  topN: 10,
  limit: 10,
});
assert.equal(serp.meta.queryCount, 2);
assert.equal(serp.own.absentQueries, 1);
assert.equal(serp.competitors[0].domain, 'competitor.example');

const distribution = await call('yaai_distribution_evidence', {
  relativeJsonPath: 'distribution.json',
  limit: 10,
});
assert.equal(distribution.meta.platform, 'youtube');
assert.equal(distribution.entityCount, 1);
assert.equal(distribution.contentCount, 1);
assert.equal(distribution.entities[0].entity.name, 'Demo Channel');
assert.equal(distribution.content[0].latestMetrics.views, 1000);

const evaluation = await call('yaai_evaluation_evidence', {
  relativeJsonPath: 'evaluation.json',
  limit: 10,
});
assert.equal(evaluation.meta.profileId, 'demo-eval');
assert.equal(evaluation.meta.itemCount, 2);
assert.equal(evaluation.meta.needsReviewCount, 1);
assert.equal(evaluation.questionStats.fit.values.high, 1);
assert.equal(evaluation.questionStats.fit.values.low, 1);
assert.equal(evaluation.evaluationCount, 2);
assert.equal(evaluation.evaluations[1].route.needsReview, true);
const pain = await call('yaai_pain_evidence', { relativeJsonPath: 'pain-map.json', limit: 10 });
assert.equal(pain.topic, 'обработка заявок');
assert.equal(pain.cardCount, 1);
assert.equal(pain.summary.acceptedEvidence, 2);
assert.equal(pain.cards[0].bestObservedWordstatCount, 220);
assert.equal(pain.cards[0].evidence.serp[0].url, 'https://example.org/post/1');
assert.match(pain.reportPreview,/Потерянные заявки/);

const escapeAttempt = await handleRpcMessage({
  jsonrpc: '2.0',
  id: 'escape',
  method: 'tools/call',
  params: {
    name: 'yaai_webmaster_overlap',
    arguments: { relativeCsvPath: '../outside.csv' },
    _meta: meta,
  },
}, modernState, context);
assert.equal(escapeAttempt.result.isError, true);

await fs.rm(root, { recursive: true, force: true });
console.log('mcp selftest: ok');
