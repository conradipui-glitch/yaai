import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeRows } from '../lib/analyze.mjs';
import { loadCase } from '../lib/snapshots.mjs';

const API_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const apiKey = String(process.env.YAIS_API || process.env.YANDEX_API_KEY || '').trim();
const folderId = String(process.env.YAIS_FOLDER_ID || process.env.YANDEX_FOLDER_ID || 'b1gfllt28aev9insu589').trim();
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 450);
const OUT_DIR = path.resolve('results');

const CASE_ID = String(process.env.CASE_ID || 'silalesa-seo').trim();
const caseConfig = await loadCase(CASE_ID);
const PREFIX = caseConfig.resultPrefix;
const CASE_NAME = caseConfig.name;
const NUM_PHRASES = Math.min(2000, Math.max(1, Number(process.env.NUM_PHRASES || caseConfig.numPhrases || 200)));
const DEVICES = Array.isArray(caseConfig.devices) && caseConfig.devices.length ? caseConfig.devices : ['DEVICE_ALL'];
const PRESET_PATH = path.resolve('presets', `${PREFIX}.json`);

console.log(`Case: ${caseConfig.id} — ${CASE_NAME} (prefix ${PREFIX}; seeds ${caseConfig.seeds.length}; regions ${caseConfig.regions.length})`);

const seeds = caseConfig.seeds;

if (!apiKey) throw new Error('YAIS_API secret is missing');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function call(endpoint, body) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const msg = data?.message || data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${endpoint} failed (${response.status}): ${msg}`);
  }
  return data;
}

function extractRegions(value, out = new Map(), seen = new Set()) {
  if (value == null || typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);

  if (!Array.isArray(value)) {
    const id = value.regionId ?? value.region_id ?? value.id ?? value.geoId ?? value.geo_id;
    const name = value.regionName ?? value.region_name ?? value.name ?? value.title ?? value.label;
    if (id != null && name != null && String(name).trim()) {
      const key = String(id);
      if (!out.has(key)) out.set(key, { id: key, name: String(name).trim() });
    }
  }

  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    if (child && typeof child === 'object') extractRegions(child, out, seen);
  }
  return out;
}

function pickRegion(regions, exactName) {
  const exact = regions.filter((r) => norm(r.name) === norm(exactName));
  if (exact.length) return exact[0];
  const fuzzy = regions.filter((r) => norm(r.name).includes(norm(exactName)) || norm(exactName).includes(norm(r.name)));
  if (fuzzy.length === 1) return fuzzy[0];
  const prefix = norm(exactName).slice(0, 6);
  const starts = regions.filter((r) => norm(r.name).startsWith(prefix)).sort((a, b) => a.name.length - b.name.length);
  if (starts.length) return starts[0];
  const candidates = regions.slice(0, 40);
  throw new Error(`Region not found: ${exactName}. Candidates: ${candidates.map((r) => `${r.name}(${r.id})`).join(', ') || 'none'}`);
}

function addRows(map, callMeta, items, type) {
  for (const item of items || []) {
    const phrase = String(item.phrase || item.query || item.request || '').trim();
    if (!phrase) continue;
    const count = Number(item.count ?? item.shows ?? item.frequency ?? 0);
    const key = `${callMeta.region.id}|${norm(phrase)}`;
    const row = map.get(key) || {
      phrase,
      regionId: callMeta.region.id,
      regionName: callMeta.region.name,
      count: 0,
      types: new Set(),
      seeds: new Set(),
    };
    if (Number.isFinite(count)) row.count = Math.max(row.count, count);
    row.types.add(type);
    row.seeds.add(callMeta.seed);
    map.set(key, row);
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function writeCsv(rows, headers, projector) {
  return '\ufeff' + [headers.join(','), ...rows.map((row) => projector(row).map(csvCell).join(','))].join('\n');
}

function actionLabel(action) {
  if (action === 'landing') return 'landing';
  if (action === 'guide') return 'guide';
  return 'hold';
}

const tree = await call('/getRegionsTree', { folderId });
const regions = [...extractRegions(tree).values()];
console.log(`Region records discovered: ${regions.length}`);
const targets = caseConfig.regions.map((name) => pickRegion(regions, name));

console.log(`Regions: ${targets.map((r) => `${r.name} (${r.id})`).join(', ')}`);
console.log(`Batch: ${seeds.length} seeds × ${targets.length} regions = ${seeds.length * targets.length} calls`);

const merged = new Map();
const calls = [];
let n = 0;
for (const seed of seeds) {
  for (const region of targets) {
    n += 1;
    console.log(`[${n}/${seeds.length * targets.length}] ${seed} — ${region.name}`);
    const data = await call('/topRequests', {
      phrase: seed,
      numPhrases: NUM_PHRASES,
      devices: DEVICES,
      regions: [region.id],
      folderId,
    });
    const results = data.results || data.topRequests || data.top_requests || [];
    const associations = data.associations || data.associatedRequests || data.associated_requests || [];
    const meta = {
      seed,
      region,
      resultsCount: Array.isArray(results) ? results.length : 0,
      associationsCount: Array.isArray(associations) ? associations.length : 0,
    };
    calls.push(meta);
    addRows(merged, meta, results, 'top');
    addRows(merged, meta, associations, 'association');
    await sleep(REQUEST_DELAY_MS);
  }
}

const rows = [...merged.values()].map((r) => ({
  ...r,
  types: [...r.types].sort(),
  seeds: [...r.seeds].sort(),
})).sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, 'ru'));

await fs.mkdir(OUT_DIR, { recursive: true });
const generatedAt = new Date().toISOString();
const rawJson = {
  generatedAt,
  folderId,
  numPhrases: NUM_PHRASES,
  seeds,
  regions: targets,
  calls,
  rowCount: rows.length,
  rows,
};
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-wordstat-latest.json`), JSON.stringify(rawJson, null, 2), 'utf8');
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-wordstat-latest.csv`), writeCsv(
  rows,
  ['phrase','region_id','region_name','count','types','seeds'],
  (r) => [r.phrase,r.regionId,r.regionName,r.count,r.types.join('|'),r.seeds.join('|')]
), 'utf8');

const rawMd = [];
rawMd.push(`# ${CASE_NAME} — Wordstat batch`);
rawMd.push('');
rawMd.push(`Собрано: ${generatedAt}`);
rawMd.push(`Seed-фраз: ${seeds.length}; регионов: ${targets.length}; API-вызовов: ${calls.length}; уникальных строк: ${rows.length}.`);
rawMd.push('');
rawMd.push('> В raw-слое есть Associations, поэтому верхние строки могут содержать шум. Для редакционных решений используйте intent/action snapshot.');
rawMd.push('');
for (const region of targets) {
  rawMd.push(`## ${region.name}`);
  rawMd.push('');
  rawMd.push('| # | Запрос | Частотность | Тип | Seed |');
  rawMd.push('|---:|---|---:|---|---|');
  const top = rows.filter((r) => r.regionId === region.id).slice(0, 60);
  top.forEach((r, i) => rawMd.push(`| ${i + 1} | ${r.phrase.replaceAll('|','\\|')} | ${r.count} | ${r.types.join(', ')} | ${r.seeds.join(', ').replaceAll('|','\\|')} |`));
  rawMd.push('');
}
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-wordstat-summary.md`), rawMd.join('\n'), 'utf8');

// Quantitative editorial layer: Top only by default. Associations stay in raw data for discovery.
const preset = JSON.parse(await fs.readFile(PRESET_PATH, 'utf8'));
const analysis = analyzeRows(rows, preset, {
  includeTop: true,
  includeAssociations: false,
  minCount: 0,
});

const intentRows = analysis.summary.filter((item) => item.phraseCount > 0);
const actionRows = (analysis.classifiedRows || [])
  .filter((row) => (row.types || []).includes('top'))
  .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.phrase || '').localeCompare(String(b.phrase || ''), 'ru'));

await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-intents-latest.json`), JSON.stringify({
  ...analysis,
  source: {
    generatedAt,
    numPhrases: NUM_PHRASES,
    seeds,
    regions: targets,
    rawRows: rows.length,
  },
}, null, 2), 'utf8');

await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-intents-latest.csv`), writeCsv(
  intentRows,
  ['intent_id','intent_title','cluster','region_id','region_name','business_priority','relative_demand_band','relative_rank','phrase_count','max_count','strongest_phrase','dominant_query_type','next_action','commercial_phrases','informational_phrases','unmapped_phrases','top_phrases'],
  (x) => [
    x.intentId,x.intentTitle,x.cluster,x.regionId,x.regionName,x.businessPriority,
    x.relativeDemandBand,x.relativeRank ?? '',x.phraseCount,x.maxCount,x.strongestPhrase,
    x.dominantQueryType,x.nextAction,x.queryTypeCounts?.commercial || 0,
    x.queryTypeCounts?.informational || 0,x.queryTypeCounts?.unmapped || 0,
    (x.topPhrases || []).map((p) => `${p.phrase}:${p.count}:${p.queryType}:${p.nextAction}`).join('|')
  ]
), 'utf8');

await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-query-actions-latest.csv`), writeCsv(
  actionRows,
  ['phrase','region_id','region_name','count','types','seeds','analysis_status','query_type','query_confidence','query_source','next_action','intent_id','intent_title','intent_score','matched_keywords'],
  (r) => [
    r.phrase,r.regionId,r.regionName,r.count,(r.types || []).join('|'),(r.seeds || []).join('|'),
    r.analysisStatus,r.queryType,r.queryConfidence,r.querySource,r.nextAction,
    r.intentId || '',r.intentTitle || '',r.score || '',(r.matchedKeywords || []).join('|')
  ]
), 'utf8');

const intentMd = [];
intentMd.push(`# ${CASE_NAME} — intent + query action validation`);
intentMd.push('');
intentMd.push(`Собрано: ${analysis.meta.generatedAt}`);
intentMd.push(`Источник: ${rows.length} уникальных Wordstat-строк, ${seeds.length} seed × ${targets.length} региона.`);
intentMd.push(`Для количественной сводки учитывается только **Top**: eligible ${analysis.meta.eligibleRows}, распределено по intent ${analysis.meta.assignedRows}, без intent ${analysis.meta.unassignedRows}.`);
intentMd.push(`Тип спроса: commercial ${analysis.meta.queryTypeCounts?.commercial || 0}; informational ${analysis.meta.queryTypeCounts?.informational || 0}; unmapped ${analysis.meta.queryTypeCounts?.unmapped || 0}; noise ${analysis.meta.queryTypeCounts?.noise || 0}.`);
intentMd.push(`Маршрутизация: landing ${analysis.meta.nextActionCounts?.landing || 0}; guide ${analysis.meta.nextActionCounts?.guide || 0}; hold ${analysis.meta.nextActionCounts?.hold || 0}.`);
intentMd.push('');
intentMd.push('> `maxCount`, `relativeRank` и `relativeDemandBand` — сравнительные сигналы внутри этой выборки. Query type / action — эвристическая маршрутизация контента, а не гарантия SEO-результата. Частотности связанных запросов не суммируются в «объём рынка».');
intentMd.push('');

for (const region of targets) {
  const ranked = intentRows.filter((x) => x.regionId === region.id).sort((a,b) => (a.relativeRank || 9999) - (b.relativeRank || 9999));
  intentMd.push(`## ${region.name}`);
  intentMd.push('');
  intentMd.push('| Rank | ID | Приоритет | Intent | Сигнал | Тип спроса | Действие | Max | Сильнейшая фраза | Фраз |');
  intentMd.push('|---:|---|---|---|---|---|---|---:|---|---:|');
  for (const x of ranked) {
    intentMd.push(`| ${x.relativeRank ?? '—'} | ${x.intentId} | ${x.businessPriority || '—'} | ${x.intentTitle.replaceAll('|','\\|')} | ${x.relativeDemandBand} | ${x.dominantQueryType} | ${actionLabel(x.nextAction)} | ${x.maxCount} | ${String(x.strongestPhrase || '').replaceAll('|','\\|')} | ${x.phraseCount} |`);
  }
  intentMd.push('');
}

intentMd.push('## Очередь действий по фактическим Top-запросам');
intentMd.push('');
intentMd.push('| Запрос | Регион | Count | Тип спроса | Действие | Intent | Уверенность |');
intentMd.push('|---|---|---:|---|---|---|---|');
for (const row of actionRows.slice(0, 80)) {
  const intent = row.intentId ? `${row.intentId} ${row.intentTitle || ''}` : '—';
  intentMd.push(`| ${String(row.phrase).replaceAll('|','\\|')} | ${row.regionName} | ${row.count} | ${row.queryType} | ${actionLabel(row.nextAction)} | ${String(intent).replaceAll('|','\\|')} | ${row.queryConfidence || '—'} |`);
}
intentMd.push('');

const unassigned = actionRows
  .filter((row) => row.analysisStatus === 'unassigned')
  .slice(0, 40);
intentMd.push('## Top-запросы без intent для улучшения preset');
intentMd.push('');
if (!unassigned.length) {
  intentMd.push('Нет.');
} else {
  intentMd.push('| Запрос | Регион | Count | Тип спроса | Действие | Seed |');
  intentMd.push('|---|---|---:|---|---|---|');
  for (const row of unassigned) {
    intentMd.push(`| ${String(row.phrase).replaceAll('|','\\|')} | ${row.regionName} | ${row.count} | ${row.queryType} | ${actionLabel(row.nextAction)} | ${(row.seeds || []).join(', ').replaceAll('|','\\|')} |`);
  }
}
intentMd.push('');
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-intents-summary.md`), intentMd.join('\n'), 'utf8');

console.log(`DONE: ${rows.length} raw rows; ${analysis.meta.assignedRows}/${analysis.meta.eligibleRows} Top rows assigned; ${intentRows.length} intent-region signals; ${actionRows.length} query actions.`);
