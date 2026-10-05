import fs from 'node:fs/promises';
import path from 'node:path';

import { buildYouTubeDistributionDataset } from '../lib/adapters/youtube.mjs';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const args = process.argv.slice(2);

function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function csv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeQueries(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const query = String(item || '').trim();
    if (!query) continue;
    const key = query.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(query);
  }
  return result;
}

async function loadQueries() {
  const inline = csv(flag('--queries'));
  const queryFile = flag('--query-file');
  if (!queryFile) return normalizeQueries(inline);
  const source = await fs.readFile(path.resolve(queryFile), 'utf8');
  return normalizeQueries([
    ...inline,
    ...source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  ]);
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function googleGet(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`YouTube API returned non-JSON HTTP ${response.status}`);
  }

  if (!response.ok) {
    const reason = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`YouTube Data API: ${reason}`);
  }
  return payload;
}

const output = flag('--out');
const regionCode = String(flag('--region') || '').trim().toUpperCase();
const relevanceLanguage = String(flag('--language') || '').trim();
const maxResults = Math.max(1, Math.min(50, Math.trunc(Number(flag('--max-results') || 10))));
const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim();

if (!args.includes('--execute')) {
  throw new Error('No YouTube requests sent. Add --execute explicitly after reviewing query count and API quota use.');
}
if (!output) throw new Error('Specify --out /private/youtube-evidence.json.');
if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing.');
if (regionCode && !/^[A-Z]{2}$/.test(regionCode)) throw new Error('--region must be a two-letter country code, e.g. RU.');
if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 50) {
  throw new Error('--max-results must be an integer from 1 to 50.');
}

const queries = await loadQueries();
if (!queries.length) throw new Error('Provide --queries q1,q2 or --query-file /path/queries.txt.');
if (queries.length > 20) throw new Error('Maximum 20 queries per run. Split larger research batches.');

const searchPages = [];
const discoveredVideoIds = new Set();

for (let index = 0; index < queries.length; index += 1) {
  const query = queries[index];
  const payload = await googleGet(SEARCH_URL, {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults,
    order: 'relevance',
    regionCode: regionCode || undefined,
    relevanceLanguage: relevanceLanguage || undefined,
    key: apiKey,
  });

  const items = Array.isArray(payload.items) ? payload.items : [];
  searchPages.push({ query, items });
  for (const item of items) {
    const videoId = String(item?.id?.videoId || '').trim();
    if (videoId) discoveredVideoIds.add(videoId);
  }
  console.error(`YouTube search ${index + 1}/${queries.length}: ${query} -> ${items.length} videos`);
}

const videos = [];
for (const batch of chunks([...discoveredVideoIds], 50)) {
  if (!batch.length) continue;
  const payload = await googleGet(VIDEOS_URL, {
    part: 'snippet,statistics',
    id: batch.join(','),
    maxResults: 50,
    key: apiKey,
  });
  videos.push(...(Array.isArray(payload.items) ? payload.items : []));
}

const generatedAt = new Date().toISOString();
const dataset = buildYouTubeDistributionDataset({
  generatedAt,
  searchPages,
  videos,
  regionCode,
  relevanceLanguage,
});

const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(dataset, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

console.log(JSON.stringify({
  saved: destination,
  generatedAt: dataset.generatedAt,
  platform: dataset.platform,
  queries: dataset.queries.length,
  entities: dataset.entities.length,
  contentItems: dataset.contentItems.length,
  metricsSnapshots: dataset.metricsSnapshots.length,
  note: 'This command made live YouTube Data API requests. Keep the resulting evidence file private when it contains research data.',
}, null, 2));
