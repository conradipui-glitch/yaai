import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { analyzeRows } from './lib/analyze.mjs';
import { analyzeDistributionEvidence } from './lib/distribution-evidence.mjs';
import { summarizeEvaluationEvidence } from './lib/evaluation.mjs';
import { painMapMarkdown } from './lib/pain-discovery.mjs';
import { listSnapshotManifests, loadCase, pctChange } from './lib/snapshots.mjs';
import { analyzeRankTrackerCsv } from './lib/rank-tracker.mjs';
import { analyzeSerpEvidence } from './lib/serp-evidence.mjs';
import { analyzeWebmasterCsv } from './lib/webmaster-overlap.mjs';
import { resolveCaseId, resolveWorkspaceRoot, safeConfigId, workspacePaths } from './lib/workspace.mjs';
import { buildPagePlan } from './public/page-planner.js';

export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const LEGACY_PROTOCOL_VERSION = '2025-11-25';
const LEGACY_PROTOCOL_VERSIONS = new Set([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);
const SERVER_INFO = { name: 'yaai', version: '0.17.0' };
const SERVER_INSTRUCTIONS =
  'Yandex-first SEO decision engine. Tools read an explicit yaai workspace and compute analysis locally. ' +
  'The MCP surface does not call live external collection or model APIs; collect/refresh Wordstat, Webmaster, SERP, YouTube, Telegram or Jev evaluation evidence with explicit CLI workflows first.';

function objectSchema(properties = {}, required = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

const CASE_ID = {
  type: 'string',
  description: 'Case id from workspace/cases. Optional when the server was launched with --case or the workspace contains one case.',
};
const LIMIT = {
  type: 'integer',
  minimum: 1,
  maximum: 200,
  default: 30,
  description: 'Maximum number of detailed rows to return.',
};

export const TOOLS = [
  {
    name: 'yaai_workspace_overview',
    title: 'YAAI Workspace Overview',
    description: 'Inspect cases, latest result artifacts, and snapshot count without changing files.',
    inputSchema: objectSchema({ caseId: CASE_ID }),
  },
  {
    name: 'yaai_analyze_latest',
    title: 'Analyze Latest Wordstat',
    description: 'Re-run deterministic intent/query classification over the latest Wordstat JSON in the workspace.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      includeAssociations: {
        type: 'boolean',
        default: false,
        description: 'Include Wordstat association rows in addition to top queries.',
      },
      minCount: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Ignore rows below this Wordstat count.',
      },
      limit: LIMIT,
      includeReview: {
        type: 'boolean',
        default: true,
        description: 'Include low-confidence/unassigned review candidates.',
      },
    }),
  },
  {
    name: 'yaai_build_page_plan',
    title: 'Build Page Plan',
    description: 'Build CREATE / EXPAND / MERGE / HOLD recommendations from the latest classified query data and planner profile.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      includeAssociations: {
        type: 'boolean',
        default: false,
        description: 'Allow association rows to influence the page plan.',
      },
      limit: LIMIT,
    }),
  },
  {
    name: 'yaai_compare_snapshots',
    title: 'Compare Latest Snapshots',
    description: 'Compare the two latest dated Wordstat snapshots and return growth, decline, new, and lost query signals.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      limit: LIMIT,
    }),
  },
  {
    name: 'yaai_webmaster_overlap',
    title: 'Analyze Webmaster URL Overlap',
    description: 'Analyze a Webmaster query-to-URL CSV inside the selected workspace for multi-URL overlap candidates.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      relativeCsvPath: {
        type: 'string',
        description: 'Path to a CSV relative to the workspace root. Parent-directory escapes are rejected.',
      },
      minImpressions: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Minimum impressions for a query-URL pair.',
      },
      limit: LIMIT,
    }, ['relativeCsvPath']),
  },
  {
    name: 'yaai_rank_tracker',
    title: 'Yandex Rank Tracker',
    description: 'Track Yandex Webmaster average positions across dates, including movers, striking-distance queries, and page-level movement.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      relativeCsvPath: {
        type: 'string',
        description: 'Path to a dated Webmaster CSV relative to the workspace root. Parent-directory escapes are rejected.',
      },
      minImpressions: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Minimum impressions for a query or query-URL row.',
      },
      strikingStart: {
        type: 'number',
        minimum: 1,
        default: 5,
        description: 'Lower average-position boundary for striking-distance opportunities.',
      },
      strikingEnd: {
        type: 'number',
        minimum: 1,
        default: 20,
        description: 'Upper average-position boundary for striking-distance opportunities.',
      },
      limit: LIMIT,
    }, ['relativeCsvPath']),
  },
  {
    name: 'yaai_serp_evidence',
    title: 'Yandex SERP Competitor Evidence',
    description: 'Analyze a previously collected Yandex Search API SERP evidence JSON for repeated competitors, own-domain visibility, and domains ranking above the site.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      relativeJsonPath: {
        type: 'string',
        description: 'Path to a SERP evidence JSON relative to the workspace root. Parent-directory escapes are rejected.',
      },
      ownDomain: {
        type: 'string',
        description: 'Site domain to identify in results, e.g. example.ru. Falls back to the evidence file ownDomain.',
      },
      topN: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Analyze only the first N organic results per query.',
      },
      limit: LIMIT,
    }, ['relativeJsonPath']),
  },
  {
    name: 'yaai_distribution_evidence',
    title: 'Distribution Evidence',
    description: 'Analyze a previously collected platform evidence JSON using the shared Entity / ContentItem / MetricsSnapshot model. No live platform API calls are made.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      relativeJsonPath: {
        type: 'string',
        description: 'Path to a normalized distribution evidence JSON relative to the workspace root. Parent-directory escapes are rejected.',
      },
      limit: LIMIT,
    }, ['relativeJsonPath']),
  },
  {
    name: 'yaai_evaluation_evidence',
    title: 'Jev Evaluation Evidence',
    description: 'Summarize previously saved Jev/OpenRouter structured evaluation evidence, including outcome distributions and rows routed to review. No live model calls are made.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      relativeJsonPath: {
        type: 'string',
        description: 'Path to a saved Jev evaluation JSON relative to the workspace root. Parent-directory escapes are rejected.',
      },
      limit: LIMIT,
    }, ['relativeJsonPath']),
  },
  {
    name: 'yaai_pain_evidence',
    title: 'Pain Discovery Evidence',
    description: 'Read a previously generated Yandex Wordstat + SERP + Jev Pain Map with source links and unverified pain hypotheses. Never calls external APIs.',
    inputSchema: objectSchema({
      caseId: CASE_ID,
      relativeJsonPath: {
        type: 'string',
        description: 'Path to a saved Pain Map JSON within the workspace. Parent-directory escapes are rejected.',
      },
      limit: LIMIT,
    }, ['relativeJsonPath']),
  },
];

function clampLimit(value, fallback = 30) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function modernMeta() {
  return {
    'io.modelcontextprotocol/serverInfo': SERVER_INFO,
  };
}

function withEraResult(payload, modern, { cache = false } = {}) {
  if (!modern) return payload;
  return {
    resultType: 'complete',
    ...payload,
    _meta: modernMeta(),
    ...(cache ? { ttlMs: 300_000, cacheScope: 'private' } : {}),
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function toolResult(data, modern, isError = false) {
  return withEraResult({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    ...(isError ? { isError: true } : {}),
  }, modern);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function createMcpContext({
  workspaceRoot = resolveWorkspaceRoot(),
  caseId = resolveCaseId(),
} = {}) {
  const root = path.resolve(workspaceRoot);
  return {
    workspaceRoot: root,
    paths: workspacePaths(root),
    defaultCaseId: String(caseId || '').trim(),
  };
}

async function listCases(context) {
  let names = [];
  try {
    names = (await fs.readdir(context.paths.cases)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const cases = [];
  for (const name of names) {
    try {
      const data = await readJson(path.join(context.paths.cases, name));
      cases.push({
        id: data.id || path.basename(name, '.json'),
        name: data.name || data.id || name,
        resultPrefix: data.resultPrefix || '',
      });
    } catch {
      // A malformed case should not make workspace discovery impossible.
    }
  }
  return cases.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

async function selectedCase(context, requestedCaseId, { optional = false } = {}) {
  const requested = String(requestedCaseId || context.defaultCaseId || '').trim();
  if (requested) return loadCase(requested, context.workspaceRoot);

  const cases = await listCases(context);
  if (cases.length === 1) return loadCase(cases[0].id, context.workspaceRoot);
  if (optional) return null;

  if (!cases.length) throw new Error('No yaai cases found in workspace/cases.');
  throw new Error(`Multiple cases found. Pass caseId: ${cases.map((item) => item.id).join(', ')}`);
}

function publicCase(caseConfig) {
  if (!caseConfig) return null;
  const result = { ...caseConfig };
  delete result._file;
  return result;
}

function prefixFor(caseConfig) {
  return safeConfigId(caseConfig.resultPrefix, 'result prefix');
}

async function loadPresetForCase(context, caseConfig) {
  const prefix = prefixFor(caseConfig);
  return readJson(path.join(context.paths.presets, `${prefix}.json`));
}

async function loadPlannerForCase(context, caseConfig) {
  const prefix = prefixFor(caseConfig);
  try {
    return await readJson(path.join(context.paths.planners, `${prefix}.json`));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function loadLatestWordstat(context, caseConfig) {
  const prefix = prefixFor(caseConfig);
  const file = path.join(context.paths.results, `${prefix}-wordstat-latest.json`);
  const raw = await readJson(file);
  if (!Array.isArray(raw.rows)) throw new Error(`Latest Wordstat artifact has no rows: ${file}`);
  return { raw, file };
}

async function computeLatestAnalysis(context, caseConfig, args = {}) {
  const [{ raw }, preset] = await Promise.all([
    loadLatestWordstat(context, caseConfig),
    loadPresetForCase(context, caseConfig),
  ]);
  return analyzeRows(raw.rows, preset, {
    includeTop: true,
    includeAssociations: args.includeAssociations === true,
    minCount: Math.max(0, Number(args.minCount || 0)),
  });
}

async function loadOrComputeLatestAnalysis(context, caseConfig, args = {}) {
  const prefix = prefixFor(caseConfig);
  const file = path.join(context.paths.results, `${prefix}-intents-latest.json`);
  if (args.includeAssociations !== true && await pathExists(file)) return readJson(file);
  return computeLatestAnalysis(context, caseConfig, args);
}

async function workspaceOverview(context, args) {
  const cases = await listCases(context);
  const caseConfig = await selectedCase(context, args.caseId, { optional: true });
  if (!caseConfig) {
    return {
      workspaceRoot: context.workspaceRoot,
      cases,
      selectedCase: null,
      note: cases.length > 1 ? 'Pass caseId to inspect one case in detail.' : 'No case selected.',
    };
  }

  const prefix = prefixFor(caseConfig);
  let resultFiles = [];
  try {
    resultFiles = (await fs.readdir(context.paths.results))
      .filter((name) => name.startsWith(`${prefix}-`))
      .sort();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const snapshots = await listSnapshotManifests(caseConfig.id, context.workspaceRoot);
  return {
    workspaceRoot: context.workspaceRoot,
    cases,
    selectedCase: publicCase(caseConfig),
    resultFiles,
    snapshotCount: snapshots.length,
    latestSnapshot: snapshots.at(-1)?.manifest?.generatedAt || null,
    capabilities: {
      wordstatAnalysis: true,
      pagePlanner: true,
      snapshotComparison: true,
      webmasterOverlap: true,
      rankTracker: true,
      serpEvidence: true,
      distributionEvidence: true,
      evaluationEvidence: true,
      painEvidence: true,
      paidApiCallsFromMcp: false,
    },
  };
}

async function analyzeLatest(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const analysis = await computeLatestAnalysis(context, caseConfig, args);
  const limit = clampLimit(args.limit);

  const nonEmptySignals = (analysis.summary || [])
    .filter((item) => Number(item.phraseCount || 0) > 0)
    .sort((a, b) => Number(b.maxCount || 0) - Number(a.maxCount || 0));

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    meta: analysis.meta,
    signals: nonEmptySignals.slice(0, limit),
    signalCount: nonEmptySignals.length,
    omittedSignals: Math.max(0, nonEmptySignals.length - limit),
    review: args.includeReview === false ? [] : (analysis.reviewRows || []).slice(0, limit),
    reviewCount: args.includeReview === false ? 0 : (analysis.reviewRows || []).length,
  };
}

async function buildLatestPagePlan(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const [analysis, planner] = await Promise.all([
    loadOrComputeLatestAnalysis(context, caseConfig, args),
    loadPlannerForCase(context, caseConfig),
  ]);
  const prefix = prefixFor(caseConfig);
  const plan = buildPagePlan(
    analysis,
    { id: prefix, pagePlanner: planner },
    { includeAssociations: args.includeAssociations === true },
  );
  const limit = clampLimit(args.limit);

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    meta: plan.meta,
    pages: plan.pages.slice(0, limit),
    pageCount: plan.pages.length,
    omittedPages: Math.max(0, plan.pages.length - limit),
    holdRows: (plan.holdRows || []).slice(0, limit),
    holdCount: (plan.holdRows || []).length,
  };
}

function isTop(row) {
  return Array.isArray(row.types) && row.types.includes('top');
}

function queryKey(row) {
  return `${row.regionId}|${String(row.phrase || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function topMap(raw) {
  const map = new Map();
  for (const row of raw.rows || []) {
    if (isTop(row)) map.set(queryKey(row), row);
  }
  return map;
}

async function compareLatestSnapshots(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const snapshots = await listSnapshotManifests(caseConfig.id, context.workspaceRoot);
  const limit = clampLimit(args.limit);

  if (snapshots.length < 2) {
    return {
      caseId: caseConfig.id,
      comparable: false,
      reason: 'need_two_snapshots',
      snapshotCount: snapshots.length,
      current: snapshots.at(-1)?.manifest?.generatedAt || null,
    };
  }

  const previous = snapshots.at(-2);
  const current = snapshots.at(-1);
  const previousRaw = await readJson(path.join(
    previous.dir,
    previous.manifest.files?.wordstatJson || 'wordstat.json',
  ));
  const currentRaw = await readJson(path.join(
    current.dir,
    current.manifest.files?.wordstatJson || 'wordstat.json',
  ));

  const prevMap = topMap(previousRaw);
  const currMap = topMap(currentRaw);
  const shared = [];
  const added = [];
  const removed = [];

  for (const [key, row] of currMap) {
    const before = prevMap.get(key);
    if (!before) {
      added.push({ ...row, previousCount: 0, currentCount: Number(row.count || 0) });
      continue;
    }
    const previousCount = Number(before.count || 0);
    const currentCount = Number(row.count || 0);
    shared.push({
      phrase: row.phrase,
      regionId: row.regionId,
      regionName: row.regionName,
      previousCount,
      currentCount,
      delta: currentCount - previousCount,
      percent: pctChange(previousCount, currentCount),
    });
  }

  for (const [key, row] of prevMap) {
    if (!currMap.has(key)) {
      removed.push({ ...row, previousCount: Number(row.count || 0), currentCount: 0 });
    }
  }

  const meaningful = shared
    .filter((row) => Math.max(row.previousCount, row.currentCount) >= 10)
    .sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0) || b.currentCount - a.currentCount);
  const growth = meaningful.filter((row) => (row.percent ?? 0) >= 10);
  const decline = meaningful
    .filter((row) => (row.percent ?? 0) <= -10)
    .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
  const newQueries = added.sort((a, b) => b.currentCount - a.currentCount);
  const lostQueries = removed.sort((a, b) => b.previousCount - a.previousCount);

  const sameCaseDefinition = previous.manifest.caseFingerprint === current.manifest.caseFingerprint;
  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    comparable: sameCaseDefinition,
    warning: sameCaseDefinition ? null : 'case_definition_changed',
    previous: previous.manifest.generatedAt,
    current: current.manifest.generatedAt,
    counts: {
      shared: shared.length,
      new: added.length,
      lost: removed.length,
      growth: growth.length,
      decline: decline.length,
    },
    growth: growth.slice(0, limit),
    decline: decline.slice(0, limit),
    newQueries: newQueries.slice(0, limit),
    lostQueries: lostQueries.slice(0, limit),
  };
}

function workspaceFile(context, relativePath, label = 'relativePath') {
  const raw = String(relativePath || '').trim();
  if (!raw) throw new Error(`${label} is required.`);
  const absolute = path.resolve(context.workspaceRoot, raw);
  const relative = path.relative(context.workspaceRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must resolve to a file inside the yaai workspace.`);
  }
  return absolute;
}

async function webmasterOverlap(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const csvPath = workspaceFile(context, args.relativeCsvPath, 'relativeCsvPath');
  const threshold = Math.max(1, Math.trunc(Number(args.minImpressions || 1)));
  const csv = await fs.readFile(csvPath, 'utf8');
  const result = analyzeWebmasterCsv(csv, { minImpressions: threshold });
  const limit = clampLimit(args.limit);

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    source: path.relative(context.workspaceRoot, csvPath).replaceAll(path.sep, '/'),
    inputRows: result.inputRows,
    distinctQueryPages: result.distinctQueryPages,
    candidateCount: result.candidateCount,
    note: result.note,
    overlaps: result.overlaps.slice(0, limit),
    omittedOverlaps: Math.max(0, result.overlaps.length - limit),
  };
}

async function rankTracker(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const csvPath = workspaceFile(context, args.relativeCsvPath, 'relativeCsvPath');
  const threshold = Math.max(1, Math.trunc(Number(args.minImpressions || 1)));
  const strikingStart = Math.max(1, Number(args.strikingStart || 5));
  const strikingEnd = Math.max(strikingStart, Number(args.strikingEnd || 20));
  const csv = await fs.readFile(csvPath, 'utf8');
  const result = analyzeRankTrackerCsv(csv, {
    minImpressions: threshold,
    strikingStart,
    strikingEnd,
  });
  const limit = clampLimit(args.limit);

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    source: path.relative(context.workspaceRoot, csvPath).replaceAll(path.sep, '/'),
    meta: result.meta,
    current: {
      ...result.current,
      queries: result.current.queries.slice(0, limit),
      omittedQueries: Math.max(0, result.current.queries.length - limit),
    },
    comparison: {
      ...result.comparison,
      improvements: result.comparison.improvements.slice(0, limit),
      declines: result.comparison.declines.slice(0, limit),
      newQueries: result.comparison.newQueries.slice(0, limit),
      lostQueries: result.comparison.lostQueries.slice(0, limit),
      strikingDistance: result.comparison.strikingDistance.slice(0, limit),
      pageMovements: result.comparison.pageMovements.slice(0, limit),
    },
  };
}

async function serpEvidence(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const jsonPath = workspaceFile(context, args.relativeJsonPath, 'relativeJsonPath');
  const dataset = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const topN = Math.max(1, Math.min(100, Math.trunc(Number(args.topN || 10))));
  const result = analyzeSerpEvidence(dataset, {
    ownDomain: args.ownDomain || dataset.ownDomain || '',
    topN,
  });
  const limit = clampLimit(args.limit);

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    source: path.relative(context.workspaceRoot, jsonPath).replaceAll(path.sep, '/'),
    meta: result.meta,
    own: {
      ...result.own,
      absent: result.own.absent.slice(0, limit),
      omittedAbsent: Math.max(0, result.own.absent.length - limit),
    },
    competitors: result.competitors.slice(0, limit).map((row) => ({
      ...row,
      queries: row.queries.slice(0, Math.min(limit, 20)),
    })),
    competitorCount: result.competitors.length,
    queries: result.queries.slice(0, limit),
    omittedQueries: Math.max(0, result.queries.length - limit),
  };
}

async function distributionEvidence(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const jsonPath = workspaceFile(context, args.relativeJsonPath, 'relativeJsonPath');
  const dataset = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const result = analyzeDistributionEvidence(dataset);
  const limit = clampLimit(args.limit);

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    source: path.relative(context.workspaceRoot, jsonPath).replaceAll(path.sep, '/'),
    meta: result.meta,
    entities: result.entities.slice(0, limit),
    entityCount: result.entities.length,
    omittedEntities: Math.max(0, result.entities.length - limit),
    content: result.content.slice(0, limit).map((row) => ({
      id: row.id,
      platform: row.platform,
      type: row.type,
      externalId: row.externalId,
      entityId: row.entityId,
      entityName: row.entity?.name || '',
      url: row.url,
      title: row.title,
      textPreview: String(row.text || '').slice(0, 500),
      textLength: String(row.text || '').length,
      publishedAt: row.publishedAt,
      queries: row.queries,
      latestMetrics: row.latestMetrics,
      observedAt: row.observedAt,
      metricDelta: row.metricDelta,
      metricSnapshotCount: row.metricSnapshotCount,
      entityLatestMetrics: row.entityLatestMetrics,
      entityObservedAt: row.entityObservedAt,
      viewsPerSubscriber: row.viewsPerSubscriber,
    })),
    contentCount: result.content.length,
    omittedContent: Math.max(0, result.content.length - limit),
  };
}

async function evaluationEvidence(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const jsonPath = workspaceFile(context, args.relativeJsonPath, 'relativeJsonPath');
  const dataset = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const result = summarizeEvaluationEvidence(dataset);
  const limit = clampLimit(args.limit);

  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    source: path.relative(context.workspaceRoot, jsonPath).replaceAll(path.sep, '/'),
    meta: result.meta,
    questionStats: result.questionStats,
    evaluations: result.evaluations.slice(0, limit),
    videoMap: Array.isArray(dataset.videoMap) ? dataset.videoMap.slice(0, limit) : [],
    videoCount: Array.isArray(dataset.videoMap) ? dataset.videoMap.length : 0,
    evaluationCount: result.evaluations.length,
    omittedEvaluations: Math.max(0, result.evaluations.length - limit),
  };
}

async function painEvidence(context, args) {
  const caseConfig = await selectedCase(context, args.caseId);
  const jsonPath = workspaceFile(context, args.relativeJsonPath, 'relativeJsonPath');
  const map = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  if (map.source !== 'yaai-pain-discovery' || Number(map.schemaVersion) !== 1 || !Array.isArray(map.cards)) {
    throw new Error('Expected a saved yaai Pain Map JSON.');
  }
  const limit = clampLimit(args.limit);
  return {
    caseId: caseConfig.id,
    caseName: caseConfig.name,
    source: path.relative(context.workspaceRoot, jsonPath).replaceAll(path.sep, '/'),
    topic: map.topic,
    summary: map.summary,
    methodology: map.methodology,
    cards: map.cards.slice(0, limit),
    cardCount: map.cards.length,
    omittedCards: Math.max(0, map.cards.length - limit),
    reportPreview: painMapMarkdown({ ...map, cards: map.cards.slice(0, Math.min(3, limit)) }).slice(0, 3500),
  };
}

const TOOL_HANDLERS = {
  yaai_workspace_overview: workspaceOverview,
  yaai_analyze_latest: analyzeLatest,
  yaai_build_page_plan: buildLatestPagePlan,
  yaai_compare_snapshots: compareLatestSnapshots,
  yaai_webmaster_overlap: webmasterOverlap,
  yaai_rank_tracker: rankTracker,
  yaai_serp_evidence: serpEvidence,
  yaai_distribution_evidence: distributionEvidence,
  yaai_evaluation_evidence: evaluationEvidence,
  yaai_pain_evidence: painEvidence,
};

function protocolFromMessage(message, state) {
  const version = message?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  if (version) {
    if (version !== MODERN_PROTOCOL_VERSION) {
      return { error: jsonRpcError(message.id, -32022, 'Unsupported protocol version', {
        requestedVersion: version,
        supportedVersions: [MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
      }) };
    }
    state.era = 'modern';
    return { modern: true };
  }
  return { modern: state.era === 'modern' };
}

export async function handleRpcMessage(message, state = {}, context = createMcpContext()) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return jsonRpcError(message?.id, -32600, 'Invalid Request');
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
  if (!hasId) {
    if (message.method === 'notifications/initialized') state.era = 'legacy';
    return null;
  }

  if (message.method === 'server/discover') {
    state.era = 'modern';
    return jsonRpcResult(message.id, {
      resultType: 'complete',
      supportedVersions: [MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
      capabilities: { tools: {} },
      _meta: modernMeta(),
      instructions: SERVER_INSTRUCTIONS,
      ttlMs: 300_000,
      cacheScope: 'private',
    });
  }

  if (message.method === 'initialize') {
    state.era = 'legacy';
    const requested = String(message.params?.protocolVersion || LEGACY_PROTOCOL_VERSION);
    const protocolVersion = LEGACY_PROTOCOL_VERSIONS.has(requested)
      ? requested
      : LEGACY_PROTOCOL_VERSION;
    return jsonRpcResult(message.id, {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: SERVER_INSTRUCTIONS,
    });
  }

  const protocol = protocolFromMessage(message, state);
  if (protocol.error) return protocol.error;
  const modern = protocol.modern;

  if (message.method === 'ping') {
    return jsonRpcResult(message.id, withEraResult({}, modern));
  }

  if (message.method === 'tools/list') {
    return jsonRpcResult(message.id, withEraResult({ tools: TOOLS }, modern, { cache: true }));
  }

  if (message.method === 'tools/call') {
    const name = String(message.params?.name || '');
    const handler = TOOL_HANDLERS[name];
    if (!handler) return jsonRpcError(message.id, -32602, `Unknown tool: ${name || '(empty)'}`);

    try {
      const data = await handler(context, message.params?.arguments || {});
      return jsonRpcResult(message.id, toolResult(data, modern));
    } catch (error) {
      return jsonRpcResult(message.id, toolResult({
        error: error?.message || 'Tool execution failed',
        tool: name,
      }, modern, true));
    }
  }

  return jsonRpcError(message.id, -32601, `Method not found: ${message.method}`);
}

export async function serveStdio(context = createMcpContext()) {
  const state = { era: null };
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  console.error(`yaai MCP server: workspace=${context.workspaceRoot}${context.defaultCaseId ? ` case=${context.defaultCaseId}` : ''}`);

  for await (const rawLine of input) {
    const line = rawLine.trim();
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      process.stdout.write(`${JSON.stringify(jsonRpcError(null, -32700, 'Parse error', error?.message))}\n`);
      continue;
    }

    const response = await handleRpcMessage(message, state, context);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  serveStdio().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
