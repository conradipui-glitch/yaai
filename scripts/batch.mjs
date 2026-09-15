import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeRows } from '../lib/analyze.mjs';
import { loadCase } from '../lib/snapshots.mjs';
import { requireCaseId, resolveCaseId, resolveWorkspaceRoot, workspacePaths } from '../lib/workspace.mjs';

const API_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const apiKey = String(process.env.YAIS_API || process.env.YANDEX_API_KEY || '').trim();
const folderId = String(process.env.YAIS_FOLDER_ID || process.env.YANDEX_FOLDER_ID || '').trim();
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 450);
const WORKSPACE_ROOT = resolveWorkspaceRoot();
const PATHS = workspacePaths(WORKSPACE_ROOT);
const OUT_DIR = PATHS.results;

const CASE_ID = requireCaseId(resolveCaseId());
const caseConfig = await loadCase(CASE_ID, WORKSPACE_ROOT);
const PREFIX = caseConfig.resultPrefix;
const CASE_NAME = caseConfig.name;
const NUM_PHRASES = Math.min(2000, Math.max(1, Number(process.env.NUM_PHRASES || caseConfig.numPhrases || 200)));
const DEVICES = Array.isArray(caseConfig.devices) && caseConfig.devices.length ? caseConfig.devices : ['DEVICE_ALL'];
const PRESET_PATH = path.join(PATHS.presets, `${PREFIX}.json`);

console.log(`Case: ${caseConfig.id} РІР‚вЂќ ${CASE_NAME} (prefix ${PREFIX}; seeds ${caseConfig.seeds.length}; regions ${caseConfig.regions.length})`);

const seeds = caseConfig.seeds;

if (!apiKey) throw new Error('YAIS_API/YANDEX_API_KEY secret is missing');
if (!folderId) throw new Error('YAIS_FOLDER_ID/YANDEX_FOLDER_ID is missing');

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
console.log(`Batch: ${seeds.length} seeds Р“вЂ” ${targets.length} regions = ${seeds.length * targets.length} calls`);

const merged = new Map();
const calls = [];
let n = 0;
for (const seed of seeds) {
  for (const region of targets) {
    n += 1;
    console.log(`[${n}/${seeds.length * targets.length}] ${seed} РІР‚вЂќ ${region.name}`);
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
rawMd.push(`# ${CASE_NAME} РІР‚вЂќ Wordstat batch`);
rawMd.push('');
rawMd.push(`Р РЋР С•Р В±РЎР‚Р В°Р Р…Р С•: ${generatedAt}`);
rawMd.push(`Seed-РЎвЂћРЎР‚Р В°Р В·: ${seeds.length}; РЎР‚Р ВµР С–Р С‘Р С•Р Р…Р С•Р Р†: ${targets.length}; API-Р Р†РЎвЂ№Р В·Р С•Р Р†Р С•Р Р†: ${calls.length}; РЎС“Р Р…Р С‘Р С”Р В°Р В»РЎРЉР Р…РЎвЂ№РЎвЂ¦ РЎРѓРЎвЂљРЎР‚Р С•Р С”: ${rows.length}.`);
rawMd.push('');
rawMd.push('> Р вЂ™ raw-РЎРѓР В»Р С•Р Вµ Р ВµРЎРѓРЎвЂљРЎРЉ Associations, Р С—Р С•РЎРЊРЎвЂљР С•Р СРЎС“ Р Р†Р ВµРЎР‚РЎвЂ¦Р Р…Р С‘Р Вµ РЎРѓРЎвЂљРЎР‚Р С•Р С”Р С‘ Р СР С•Р С–РЎС“РЎвЂљ РЎРѓР С•Р Т‘Р ВµРЎР‚Р В¶Р В°РЎвЂљРЎРЉ РЎв‚¬РЎС“Р С. Р вЂќР В»РЎРЏ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂ Р С‘Р С•Р Р…Р Р…РЎвЂ№РЎвЂ¦ РЎР‚Р ВµРЎв‚¬Р ВµР Р…Р С‘Р в„– Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р в„–РЎвЂљР Вµ intent/action snapshot.');
rawMd.push('');
for (const region of targets) {
  rawMd.push(`## ${region.name}`);
  rawMd.push('');
  rawMd.push('| # | Р вЂ”Р В°Р С—РЎР‚Р С•РЎРѓ | Р В§Р В°РЎРѓРЎвЂљР С•РЎвЂљР Р…Р С•РЎРѓРЎвЂљРЎРЉ | Р СћР С‘Р С— | Seed |');
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
intentMd.push(`# ${CASE_NAME} РІР‚вЂќ intent + query action validation`);
intentMd.push('');
intentMd.push(`Р РЋР С•Р В±РЎР‚Р В°Р Р…Р С•: ${analysis.meta.generatedAt}`);
intentMd.push(`Р ВРЎРѓРЎвЂљР С•РЎвЂЎР Р…Р С‘Р С”: ${rows.length} РЎС“Р Р…Р С‘Р С”Р В°Р В»РЎРЉР Р…РЎвЂ№РЎвЂ¦ Wordstat-РЎРѓРЎвЂљРЎР‚Р С•Р С”, ${seeds.length} seed Р“вЂ” ${targets.length} РЎР‚Р ВµР С–Р С‘Р С•Р Р…Р В°.`);
intentMd.push(`Р вЂќР В»РЎРЏ Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р ВµР Р…Р Р…Р С•Р в„– РЎРѓР Р†Р С•Р Т‘Р С”Р С‘ РЎС“РЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°Р ВµРЎвЂљРЎРѓРЎРЏ РЎвЂљР С•Р В»РЎРЉР С”Р С• **Top**: eligible ${analysis.meta.eligibleRows}, РЎР‚Р В°РЎРѓР С—РЎР‚Р ВµР Т‘Р ВµР В»Р ВµР Р…Р С• Р С—Р С• intent ${analysis.meta.assignedRows}, Р В±Р ВµР В· intent ${analysis.meta.unassignedRows}.`);
intentMd.push(`Р СћР С‘Р С— РЎРѓР С—РЎР‚Р С•РЎРѓР В°: commercial ${analysis.meta.queryTypeCounts?.commercial || 0}; informational ${analysis.meta.queryTypeCounts?.informational || 0}; unmapped ${analysis.meta.queryTypeCounts?.unmapped || 0}; noise ${analysis.meta.queryTypeCounts?.noise || 0}.`);
intentMd.push(`Р СљР В°РЎР‚РЎв‚¬РЎР‚РЎС“РЎвЂљР С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ: landing ${analysis.meta.nextActionCounts?.landing || 0}; guide ${analysis.meta.nextActionCounts?.guide || 0}; hold ${analysis.meta.nextActionCounts?.hold || 0}.`);
intentMd.push('');
intentMd.push('> `maxCount`, `relativeRank` Р С‘ `relativeDemandBand` РІР‚вЂќ РЎРѓРЎР‚Р В°Р Р†Р Р…Р С‘РЎвЂљР ВµР В»РЎРЉР Р…РЎвЂ№Р Вµ РЎРѓР С‘Р С–Р Р…Р В°Р В»РЎвЂ№ Р Р†Р Р…РЎС“РЎвЂљРЎР‚Р С‘ РЎРЊРЎвЂљР С•Р в„– Р Р†РЎвЂ№Р В±Р С•РЎР‚Р С”Р С‘. Query type / action РІР‚вЂќ РЎРЊР Р†РЎР‚Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р В°РЎРЏ Р СР В°РЎР‚РЎв‚¬РЎР‚РЎС“РЎвЂљР С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ Р С”Р С•Р Р…РЎвЂљР ВµР Р…РЎвЂљР В°, Р В° Р Р…Р Вµ Р С–Р В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎРЏ SEO-РЎР‚Р ВµР В·РЎС“Р В»РЎРЉРЎвЂљР В°РЎвЂљР В°. Р В§Р В°РЎРѓРЎвЂљР С•РЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ РЎРѓР Р†РЎРЏР В·Р В°Р Р…Р Р…РЎвЂ№РЎвЂ¦ Р В·Р В°Р С—РЎР‚Р С•РЎРѓР С•Р Р† Р Р…Р Вµ РЎРѓРЎС“Р СР СР С‘РЎР‚РЎС“РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р† Р’В«Р С•Р В±РЎР‰РЎвЂР С РЎР‚РЎвЂ№Р Р…Р С”Р В°Р’В».');
intentMd.push('');

for (const region of targets) {
  const ranked = intentRows.filter((x) => x.regionId === region.id).sort((a,b) => (a.relativeRank || 9999) - (b.relativeRank || 9999));
  intentMd.push(`## ${region.name}`);
  intentMd.push('');
  intentMd.push('| Rank | ID | Р СџРЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљ | Intent | Р РЋР С‘Р С–Р Р…Р В°Р В» | Р СћР С‘Р С— РЎРѓР С—РЎР‚Р С•РЎРѓР В° | Р вЂќР ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ | Max | Р РЋР С‘Р В»РЎРЉР Р…Р ВµР в„–РЎв‚¬Р В°РЎРЏ РЎвЂћРЎР‚Р В°Р В·Р В° | Р В¤РЎР‚Р В°Р В· |');
  intentMd.push('|---:|---|---|---|---|---|---|---:|---|---:|');
  for (const x of ranked) {
    intentMd.push(`| ${x.relativeRank ?? 'РІР‚вЂќ'} | ${x.intentId} | ${x.businessPriority || 'РІР‚вЂќ'} | ${x.intentTitle.replaceAll('|','\\|')} | ${x.relativeDemandBand} | ${x.dominantQueryType} | ${actionLabel(x.nextAction)} | ${x.maxCount} | ${String(x.strongestPhrase || '').replaceAll('|','\\|')} | ${x.phraseCount} |`);
  }
  intentMd.push('');
}

intentMd.push('## Р С›РЎвЂЎР ВµРЎР‚Р ВµР Т‘РЎРЉ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р в„– Р С—Р С• РЎвЂћР В°Р С”РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С‘Р С Top-Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В°Р С');
intentMd.push('');
intentMd.push('| Р вЂ”Р В°Р С—РЎР‚Р С•РЎРѓ | Р В Р ВµР С–Р С‘Р С•Р Р… | Count | Р СћР С‘Р С— РЎРѓР С—РЎР‚Р С•РЎРѓР В° | Р вЂќР ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ | Intent | Р Р€Р Р†Р ВµРЎР‚Р ВµР Р…Р Р…Р С•РЎРѓРЎвЂљРЎРЉ |');
intentMd.push('|---|---|---:|---|---|---|---|');
for (const row of actionRows.slice(0, 80)) {
  const intent = row.intentId ? `${row.intentId} ${row.intentTitle || ''}` : 'РІР‚вЂќ';
  intentMd.push(`| ${String(row.phrase).replaceAll('|','\\|')} | ${row.regionName} | ${row.count} | ${row.queryType} | ${actionLabel(row.nextAction)} | ${String(intent).replaceAll('|','\\|')} | ${row.queryConfidence || 'РІР‚вЂќ'} |`);
}
intentMd.push('');

const unassigned = actionRows
  .filter((row) => row.analysisStatus === 'unassigned')
  .slice(0, 40);
intentMd.push('## Top-Р В·Р В°Р С—РЎР‚Р С•РЎРѓРЎвЂ№ Р В±Р ВµР В· intent Р Т‘Р В»РЎРЏ РЎС“Р В»РЎС“РЎвЂЎРЎв‚¬Р ВµР Р…Р С‘РЎРЏ preset');
intentMd.push('');
if (!unassigned.length) {
  intentMd.push('Р СњР ВµРЎвЂљ.');
} else {
  intentMd.push('| Р вЂ”Р В°Р С—РЎР‚Р С•РЎРѓ | Р В Р ВµР С–Р С‘Р С•Р Р… | Count | Р СћР С‘Р С— РЎРѓР С—РЎР‚Р С•РЎРѓР В° | Р вЂќР ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ | Seed |');
  intentMd.push('|---|---|---:|---|---|---|');
  for (const row of unassigned) {
    intentMd.push(`| ${String(row.phrase).replaceAll('|','\\|')} | ${row.regionName} | ${row.count} | ${row.queryType} | ${actionLabel(row.nextAction)} | ${(row.seeds || []).join(', ').replaceAll('|','\\|')} |`);
  }
}
intentMd.push('');
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-intents-summary.md`), intentMd.join('\n'), 'utf8');

console.log(`DONE: ${rows.length} raw rows; ${analysis.meta.assignedRows}/${analysis.meta.eligibleRows} Top rows assigned; ${intentRows.length} intent-region signals; ${actionRows.length} query actions.`);
