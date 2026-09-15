import fs from 'node:fs/promises';
import path from 'node:path';
import { caseRoot, listSnapshotManifests, loadCase, pctChange } from '../lib/snapshots.mjs';
import { requireCaseId, resolveCaseId, resolveWorkspaceRoot } from '../lib/workspace.mjs';

const WORKSPACE_ROOT = resolveWorkspaceRoot();
const CASE_ID = requireCaseId(resolveCaseId());
const caseConfig = await loadCase(CASE_ID, WORKSPACE_ROOT);
const snapshots = await listSnapshotManifests(CASE_ID, WORKSPACE_ROOT);
const outDir = caseRoot(CASE_ID, WORKSPACE_ROOT);
await fs.mkdir(outDir, { recursive: true });

function isTop(row) {
  return Array.isArray(row.types) && row.types.includes('top');
}

function queryKey(row) {
  return `${row.regionId}|${String(row.phrase || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function topMap(raw) {
  const map = new Map();
  for (const row of raw.rows || []) {
    if (!isTop(row)) continue;
    map.set(queryKey(row), row);
  }
  return map;
}

function escapeMd(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

if (snapshots.length < 2) {
  const current = snapshots.at(-1)?.manifest || null;
  const result = {
    caseId: CASE_ID,
    comparable: false,
    reason: 'first_snapshot',
    current: current?.generatedAt || null,
  };
  await fs.writeFile(path.join(outDir, 'latest-comparison.json'), JSON.stringify(result, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'latest-comparison.md'), `# ${caseConfig.name} вЂ” РґРёРЅР°РјРёРєР°\n\nРџРѕРєР° РµСЃС‚СЊ С‚РѕР»СЊРєРѕ РѕРґРёРЅ СЃРЅРёРјРѕРє. РџРѕСЃР»Рµ СЃР»РµРґСѓСЋС‰РµРіРѕ Р·Р°РїСѓСЃРєР° РїРѕСЏРІРёС‚СЃСЏ СЃСЂР°РІРЅРµРЅРёРµ СЃ РїСЂРµРґС‹РґСѓС‰РёРј.\n`, 'utf8');
  console.log('compare: first snapshot, nothing to compare yet');
  process.exit(0);
}

const previous = snapshots.at(-2);
const current = snapshots.at(-1);
const sameCaseDefinition = previous.manifest.caseFingerprint === current.manifest.caseFingerprint;

const previousRaw = JSON.parse(await fs.readFile(path.join(previous.dir, previous.manifest.files.wordstatJson || 'wordstat.json'), 'utf8'));
const currentRaw = JSON.parse(await fs.readFile(path.join(current.dir, current.manifest.files.wordstatJson || 'wordstat.json'), 'utf8'));
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
  if (!currMap.has(key)) removed.push({ ...row, previousCount: Number(row.count || 0), currentCount: 0 });
}

const meaningful = shared
  .filter((row) => Math.max(row.previousCount, row.currentCount) >= 10)
  .sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0) || b.currentCount - a.currentCount);

const growth = meaningful.filter((row) => (row.percent ?? 0) >= 10).slice(0, 40);
const decline = meaningful.filter((row) => (row.percent ?? 0) <= -10).sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0)).slice(0, 40);
const newQueries = added.sort((a, b) => b.currentCount - a.currentCount).slice(0, 40);
const lostQueries = removed.sort((a, b) => b.previousCount - a.previousCount).slice(0, 40);

const result = {
  schemaVersion: 1,
  caseId: CASE_ID,
  caseName: caseConfig.name,
  comparable: sameCaseDefinition,
  warning: sameCaseDefinition ? null : 'case_definition_changed',
  previous: { generatedAt: previous.manifest.generatedAt, fingerprint: previous.manifest.caseFingerprint },
  current: { generatedAt: current.manifest.generatedAt, fingerprint: current.manifest.caseFingerprint },
  counts: {
    shared: shared.length,
    new: added.length,
    lost: removed.length,
    growth: growth.length,
    decline: decline.length,
  },
  growth,
  decline,
  newQueries,
  lostQueries,
};

await fs.writeFile(path.join(outDir, 'latest-comparison.json'), JSON.stringify(result, null, 2), 'utf8');

const md = [];
md.push(`# ${caseConfig.name} вЂ” РґРёРЅР°РјРёРєР°`);
md.push('');
md.push(`РџСЂРµРґС‹РґСѓС‰РёР№ СЃРЅРёРјРѕРє: ${previous.manifest.generatedAt}`);
md.push(`РўРµРєСѓС‰РёР№ СЃРЅРёРјРѕРє: ${current.manifest.generatedAt}`);
md.push('');
if (!sameCaseDefinition) {
  md.push('> вљ пёЏ РќР°СЃС‚СЂРѕР№РєРё РєРµР№СЃР° РёР·РјРµРЅРёР»РёСЃСЊ РјРµР¶РґСѓ СЃРЅРёРјРєР°РјРё. РЎСЂР°РІРЅРµРЅРёРµ РїРѕРєР°Р·Р°РЅРѕ РєР°Рє РґРёР°РіРЅРѕСЃС‚РёС‡РµСЃРєРѕРµ, РЅРѕ РїСЂРѕС†РµРЅС‚С‹ РЅРµР»СЊР·СЏ СЃС‡РёС‚Р°С‚СЊ С‡РёСЃС‚РѕР№ РґРёРЅР°РјРёРєРѕР№ СЃРїСЂРѕСЃР°.');
  md.push('');
}
md.push('РЎСЂР°РІРЅРёРІР°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ РѕРґРёРЅР°РєРѕРІС‹Рµ Top-Р·Р°РїСЂРѕСЃС‹ РІ РѕРґРёРЅР°РєРѕРІРѕРј СЂРµРіРёРѕРЅРµ. Р§Р°СЃС‚РѕС‚РЅРѕСЃС‚Рё РЅРµ СЃСѓРјРјРёСЂСѓСЋС‚СЃСЏ РІ В«РѕР±СЉС‘Рј СЂС‹РЅРєР°В».');
md.push('');

function table(title, rows, mode) {
  md.push(`## ${title}`);
  md.push('');
  if (!rows.length) {
    md.push('РќРµС‚ Р·Р°РјРµС‚РЅС‹С… РёР·РјРµРЅРµРЅРёР№.');
    md.push('');
    return;
  }
  md.push('| Р—Р°РїСЂРѕСЃ | Р РµРіРёРѕРЅ | Р‘С‹Р»Рѕ | РЎС‚Р°Р»Рѕ | РР·РјРµРЅРµРЅРёРµ |');
  md.push('|---|---|---:|---:|---:|');
  for (const row of rows) {
    const before = mode === 'new' ? 0 : Number(row.previousCount || 0);
    const after = mode === 'lost' ? 0 : Number(row.currentCount || 0);
    const percent = row.percent == null ? (mode === 'new' ? 'NEW' : mode === 'lost' ? 'LOST' : 'вЂ”') : `${row.percent > 0 ? '+' : ''}${row.percent.toFixed(1)}%`;
    md.push(`| ${escapeMd(row.phrase)} | ${escapeMd(row.regionName)} | ${before} | ${after} | ${percent} |`);
  }
  md.push('');
}

table('Р Р°СЃС‚СѓС‰РёРµ Р·Р°РїСЂРѕСЃС‹', growth, 'change');
table('РЎРЅРёР¶Р°СЋС‰РёРµСЃСЏ Р·Р°РїСЂРѕСЃС‹', decline, 'change');
table('РќРѕРІС‹Рµ РІ С‚РµРєСѓС‰РµР№ РІС‹РґР°С‡Рµ', newQueries, 'new');
table('РСЃС‡РµР·Р»Рё РёР· С‚РµРєСѓС‰РµР№ РІС‹РґР°С‡Рё', lostQueries, 'lost');

await fs.writeFile(path.join(outDir, 'latest-comparison.md'), md.join('\n'), 'utf8');
console.log(`compare: shared=${shared.length}, new=${added.length}, lost=${removed.length}, comparable=${sameCaseDefinition}`);
