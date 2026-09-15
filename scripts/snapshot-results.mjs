import fs from 'node:fs/promises';
import path from 'node:path';
import { caseFingerprint, ensureCaseMetadata, loadCase, snapshotParts } from '../lib/snapshots.mjs';
import { requireCaseId, resolveCaseId, resolveWorkspaceRoot, workspacePaths } from '../lib/workspace.mjs';

const WORKSPACE_ROOT = resolveWorkspaceRoot();
const PATHS = workspacePaths(WORKSPACE_ROOT);
const CASE_ID = requireCaseId(resolveCaseId());
const caseConfig = await loadCase(CASE_ID, WORKSPACE_ROOT);
const prefix = String(caseConfig.resultPrefix || '').trim();
if (!prefix) throw new Error(`Case ${CASE_ID} is missing resultPrefix`);

const resultFiles = {
  wordstatJson: `${prefix}-wordstat-latest.json`,
  wordstatCsv: `${prefix}-wordstat-latest.csv`,
  wordstatSummary: `${prefix}-wordstat-summary.md`,
  intentsJson: `${prefix}-intents-latest.json`,
  intentsCsv: `${prefix}-intents-latest.csv`,
  intentsSummary: `${prefix}-intents-summary.md`,
  queryActionsCsv: `${prefix}-query-actions-latest.csv`,
  pagePlanJson: `${prefix}-page-plan-latest.json`,
  pagePlanCsv: `${prefix}-page-plan-latest.csv`,
  pagePlanSummary: `${prefix}-page-plan-summary.md`,
};

const sourceDir = PATHS.results;
const raw = JSON.parse(await fs.readFile(path.join(sourceDir, resultFiles.wordstatJson), 'utf8'));
const generated = new Date(raw.generatedAt || Date.now());
const stamp = snapshotParts(generated);
const caseDir = await ensureCaseMetadata(caseConfig, WORKSPACE_ROOT);
const snapshotDir = path.join(caseDir, 'snapshots', stamp.date, stamp.time);
await fs.mkdir(snapshotDir, { recursive: true });

const outputNames = {
  wordstatJson: 'wordstat.json',
  wordstatCsv: 'queries.csv',
  wordstatSummary: 'wordstat-summary.md',
  intentsJson: 'intents.json',
  intentsCsv: 'intents.csv',
  intentsSummary: 'intents-summary.md',
  queryActionsCsv: 'query-actions.csv',
  pagePlanJson: 'page-plan.json',
  pagePlanCsv: 'page-plan.csv',
  pagePlanSummary: 'page-plan-summary.md',
};

const copied = {};
for (const [key, sourceName] of Object.entries(resultFiles)) {
  const source = path.join(sourceDir, sourceName);
  const targetName = outputNames[key];
  try {
    await fs.copyFile(source, path.join(snapshotDir, targetName));
    copied[key] = targetName;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const manifest = {
  schemaVersion: 1,
  caseId: caseConfig.id,
  caseName: caseConfig.name,
  generatedAt: stamp.iso,
  date: stamp.date,
  run: stamp.time,
  engineVersion: '0.6.0',
  caseFingerprint: caseFingerprint(caseConfig),
  source: {
    resultPrefix: prefix,
    numPhrases: raw.numPhrases ?? caseConfig.numPhrases ?? null,
    regions: raw.regions || caseConfig.regions || [],
    seeds: raw.seeds || caseConfig.seeds || [],
    rowCount: raw.rowCount ?? null,
  },
  files: copied,
};

await fs.writeFile(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
await fs.writeFile(path.join(caseDir, 'latest.json'), JSON.stringify({
  caseId: caseConfig.id,
  generatedAt: stamp.iso,
  snapshot: path.relative(caseDir, snapshotDir).replaceAll(path.sep, '/'),
  caseFingerprint: manifest.caseFingerprint,
}, null, 2), 'utf8');

console.log(`snapshot: ${caseConfig.id} -> ${path.relative(WORKSPACE_ROOT, snapshotDir)}`);
