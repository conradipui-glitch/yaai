import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRows } from '../lib/analyze.mjs';
import { loadCase } from '../lib/snapshots.mjs';
import { resolveWorkspaceRoot, workspacePaths } from '../lib/workspace.mjs';
import { buildPagePlan } from '../public/page-planner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '../examples/workspace');
const resolved = resolveWorkspaceRoot({ args: ['--workspace', workspace], env: {}, cwd: process.cwd() });
assert.equal(resolved, workspace);

const paths = workspacePaths(workspace, { args: [], env: {}, cwd: process.cwd() });
assert.equal(paths.cases, path.join(workspace, 'cases'));
assert.equal(paths.snapshots, path.join(workspace, 'snapshots'));

const caseConfig = await loadCase('example-seo', workspace);
assert.equal(caseConfig.resultPrefix, 'example');

const preset = JSON.parse(await fs.readFile(path.join(paths.presets, 'example.json'), 'utf8'));
const pagePlanner = JSON.parse(await fs.readFile(path.join(paths.planners, 'example.json'), 'utf8'));
const rows = [
  { phrase: 'buy widget online', regionId: '1', regionName: 'Example Region', count: 120, types: ['top'], seeds: ['buy widget'] },
  { phrase: 'how to choose widget', regionId: '1', regionName: 'Example Region', count: 80, types: ['top'], seeds: ['how to choose widget'] },
  { phrase: 'free template widget', regionId: '1', regionName: 'Example Region', count: 999, types: ['top'], seeds: ['widget'] },
  { phrase: 'widget reviews 2026', regionId: '1', regionName: 'Example Region', count: 30, types: ['top'], seeds: ['widget'] },
];

const analysis = analyzeRows(rows, preset, { includeTop: true, includeAssociations: false });
assert.equal(analysis.meta.eligibleRows, 4);
assert.equal(analysis.meta.assignedRows, 2);
assert.equal(analysis.meta.unassignedRows, 1);
assert.equal(analysis.meta.negativeRows, 1);

const commercial = analysis.assignedRows.find((row) => row.phrase === 'buy widget online');
assert.equal(commercial.intentId, 'EX01');
assert.equal(commercial.queryType, 'commercial');
assert.equal(commercial.nextAction, 'landing');

const informational = analysis.assignedRows.find((row) => row.phrase === 'how to choose widget');
assert.equal(informational.intentId, 'EX02');
assert.equal(informational.queryType, 'informational');
assert.equal(informational.nextAction, 'guide');
const negative = analysis.classifiedRows.find((row) => row.phrase === 'free template widget');
assert.equal(negative.analysisStatus, 'negative');
assert.equal(negative.queryType, 'noise');
assert.equal(negative.nextAction, 'hold');

const unknown = analysis.classifiedRows.find((row) => row.phrase === 'widget reviews 2026');
assert.equal(unknown.analysisStatus, 'unassigned');
assert.equal(unknown.queryType, 'unmapped');
assert.equal(unknown.nextAction, 'hold');

const plan = buildPagePlan(analysis, { id: preset.id, pagePlanner });
const landing = plan.pages.find((page) => page.planId === 'example-main');
assert.ok(landing);
assert.equal(landing.decision, 'expand');
assert.equal(landing.path, '/widgets/');

const guide = plan.pages.find((page) => page.planId === 'example-guide');
assert.ok(guide);
assert.equal(guide.decision, 'create');
assert.equal(guide.path, '/guides/how-to-choose-a-widget/');
assert.ok(plan.holdRows.some((row) => row.phrase === 'free template widget'));
assert.ok(plan.holdRows.some((row) => row.phrase === 'widget reviews 2026'));

console.log('selftest: ok');
