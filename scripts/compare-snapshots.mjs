import fs from 'node:fs/promises';
import path from 'node:path';
import { caseRoot, listSnapshotManifests, loadCase, pctChange } from '../lib/snapshots.mjs';

const CASE_ID = process.env.CASE_ID || 'silalesa-seo';
const caseConfig = await loadCase(CASE_ID);
const snapshots = await listSnapshotManifests(CASE_ID);
const outDir = caseRoot(CASE_ID);
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
  await fs.writeFile(path.join(outDir, 'latest-comparison.md'), `# ${caseConfig.name} — динамика\n\nПока есть только один снимок. После следующего запуска появится сравнение с предыдущим.\n`, 'utf8');
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
md.push(`# ${caseConfig.name} — динамика`);
md.push('');
md.push(`Предыдущий снимок: ${previous.manifest.generatedAt}`);
md.push(`Текущий снимок: ${current.manifest.generatedAt}`);
md.push('');
if (!sameCaseDefinition) {
  md.push('> ⚠️ Настройки кейса изменились между снимками. Сравнение показано как диагностическое, но проценты нельзя считать чистой динамикой спроса.');
  md.push('');
}
md.push('Сравниваются только одинаковые Top-запросы в одинаковом регионе. Частотности не суммируются в «объём рынка».');
md.push('');

function table(title, rows, mode) {
  md.push(`## ${title}`);
  md.push('');
  if (!rows.length) {
    md.push('Нет заметных изменений.');
    md.push('');
    return;
  }
  md.push('| Запрос | Регион | Было | Стало | Изменение |');
  md.push('|---|---|---:|---:|---:|');
  for (const row of rows) {
    const before = mode === 'new' ? 0 : Number(row.previousCount || 0);
    const after = mode === 'lost' ? 0 : Number(row.currentCount || 0);
    const percent = row.percent == null ? (mode === 'new' ? 'NEW' : mode === 'lost' ? 'LOST' : '—') : `${row.percent > 0 ? '+' : ''}${row.percent.toFixed(1)}%`;
    md.push(`| ${escapeMd(row.phrase)} | ${escapeMd(row.regionName)} | ${before} | ${after} | ${percent} |`);
  }
  md.push('');
}

table('Растущие запросы', growth, 'change');
table('Снижающиеся запросы', decline, 'change');
table('Новые в текущей выдаче', newQueries, 'new');
table('Исчезли из текущей выдачи', lostQueries, 'lost');

await fs.writeFile(path.join(outDir, 'latest-comparison.md'), md.join('\n'), 'utf8');
console.log(`compare: shared=${shared.length}, new=${added.length}, lost=${removed.length}, comparable=${sameCaseDefinition}`);
