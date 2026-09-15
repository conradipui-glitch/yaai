import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const apiKey = String(process.env.YAIS_API || process.env.YANDEX_API_KEY || '').trim();
const folderId = String(process.env.YAIS_FOLDER_ID || process.env.YANDEX_FOLDER_ID || 'b1gfllt28aev9insu589').trim();
const NUM_PHRASES = Math.min(2000, Math.max(1, Number(process.env.NUM_PHRASES || 200)));
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 450);
const OUT_DIR = path.resolve('results');

const seeds = [
  'готовая баня',
  'мобильная баня',
  'баня под ключ',
  'каркасная баня',
  'кедровая баня',
  'баня 2х2',
  'баня 3х2',
  'баня 4х2',
  'фундамент под баню',
  'баня зимой',
  'доставка бани',
  'баня на участок',
  'бурение скважин',
  'полусухая стяжка',
  'механизированная штукатурка',
];

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
  const nearby = regions.filter((r) => /омск/i.test(r.name)).slice(0, 20);
  throw new Error(`Region not found: ${exactName}. Omsk-like candidates: ${nearby.map((r) => `${r.name}(${r.id})`).join(', ') || 'none'}`);
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

const tree = await call('/getRegionsTree', { folderId });
const regions = [...extractRegions(tree).values()];
console.log(`Region records discovered: ${regions.length}`);
const targets = [pickRegion(regions, 'Омск'), pickRegion(regions, 'Омская область')];

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
      devices: ['DEVICE_ALL'],
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
const json = {
  generatedAt,
  folderId,
  numPhrases: NUM_PHRASES,
  seeds,
  regions: targets,
  calls,
  rowCount: rows.length,
  rows,
};
await fs.writeFile(path.join(OUT_DIR, 'silalesa-wordstat-latest.json'), JSON.stringify(json, null, 2), 'utf8');

const csvHeader = ['phrase','region_id','region_name','count','types','seeds'];
const csvLines = [csvHeader.join(',')];
for (const r of rows) {
  csvLines.push([
    r.phrase,
    r.regionId,
    r.regionName,
    r.count,
    r.types.join('|'),
    r.seeds.join('|'),
  ].map(csvCell).join(','));
}
await fs.writeFile(path.join(OUT_DIR, 'silalesa-wordstat-latest.csv'), '\ufeff' + csvLines.join('\n'), 'utf8');

const md = [];
md.push('# Сила Леса — Wordstat batch');
md.push('');
md.push(`Собрано: ${generatedAt}`);
md.push(`Seed-фраз: ${seeds.length}; регионов: ${targets.length}; API-вызовов: ${calls.length}; уникальных строк: ${rows.length}.`);
md.push('');
for (const region of targets) {
  md.push(`## ${region.name}`);
  md.push('');
  md.push('| # | Запрос | Частотность | Тип | Seed |');
  md.push('|---:|---|---:|---|---|');
  const top = rows.filter((r) => r.regionId === region.id).slice(0, 60);
  top.forEach((r, i) => {
    md.push(`| ${i + 1} | ${r.phrase.replaceAll('|','\\|')} | ${r.count} | ${r.types.join(', ')} | ${r.seeds.join(', ').replaceAll('|','\\|')} |`);
  });
  md.push('');
}
md.push('## По seed-фразам');
md.push('');
for (const seed of seeds) {
  md.push(`### ${seed}`);
  for (const region of targets) {
    const top = rows.filter((r) => r.regionId === region.id && r.seeds.includes(seed)).slice(0, 12);
    md.push(`**${region.name}:** ${top.map((r) => `${r.phrase} — ${r.count}`).join('; ') || 'нет данных'}`);
  }
  md.push('');
}
await fs.writeFile(path.join(OUT_DIR, 'silalesa-wordstat-summary.md'), md.join('\n'), 'utf8');

console.log(`DONE: ${rows.length} unique rows written to results/`);
