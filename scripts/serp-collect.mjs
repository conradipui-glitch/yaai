import fs from 'node:fs/promises';
import path from 'node:path';

import { decodeYandexSearchResponse } from '../lib/serp-evidence.mjs';
import { discoverYandexFolderId } from '../lib/yandex-folder.mjs';
import { collectYandexWithCheckpoints } from '../lib/yandex-checkpoints.mjs';

const API_URL = 'https://searchapi.api.cloud.yandex.net/v2/web/search';
const REQUEST_DELAY_MS = 500;

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
  const fromFile = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return normalizeQueries([...inline, ...fromFile]);
}

function apiKey() {
  return String(
    process.env.YANDEX_SEARCH_API_KEY
    || process.env.YANDEX_API_KEY
    || process.env.YAIS_API
    || ''
  ).trim();
}

function configuredFolderId() {
  return String(
    process.env.YANDEX_SEARCH_FOLDER_ID
    || process.env.YANDEX_FOLDER_ID
    || process.env.YAIS_FOLDER_ID
    || ''
  ).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function search(query, { region, groupsOnPage, key, folder }) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: {
        searchType: 'SEARCH_TYPE_RU',
        queryText: query,
        familyMode: 'FAMILY_MODE_MODERATE',
        page: '0',
        fixTypoMode: 'FIX_TYPO_MODE_OFF',
      },
      groupSpec: {
        groupMode: 'GROUP_MODE_FLAT',
        groupsOnPage: String(groupsOnPage),
        docsInGroup: '1',
      },
      region: String(region),
      l10n: 'LOCALIZATION_RU',
      folderId: folder,
      responseFormat: 'FORMAT_XML',
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Yandex Search API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) {
    const reason = payload?.message || payload?.error?.message || payload?.details || `HTTP ${response.status}`;
    throw new Error(`Yandex Search API: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
  }

  const parsed = decodeYandexSearchResponse(payload);
  return {
    query,
    found: parsed.found,
    results: parsed.results.slice(0, groupsOnPage),
  };
}

const output = flag('--out');
const region = flag('--region');
const groupsOnPage = Math.max(1, Math.min(100, Math.trunc(Number(flag('--groups') || 10))));
const ownDomain = String(flag('--own-domain') || '').trim();

if (!args.includes('--execute')) {
  throw new Error('No SERP requests sent. Add --execute explicitly after reviewing query count, region and Search API billing.');
}
if (!output) throw new Error('Specify --out /private/serp-evidence.json.');
if (!region || !/^\d+$/.test(String(region))) throw new Error('Specify numeric Yandex search --region <id>.');
if (!Number.isSafeInteger(groupsOnPage) || groupsOnPage < 1 || groupsOnPage > 100) {
  throw new Error('--groups must be an integer from 1 to 100 for XML results.');
}

const queries = await loadQueries();
if (!queries.length) throw new Error('Provide --queries q1,q2 or --query-file /path/queries.txt.');
if (queries.length > 50) throw new Error('Maximum 50 queries per run. Split larger collections.');

const key = apiKey();
if (!key) throw new Error('Yandex Search API key is missing. Set YANDEX_SEARCH_API_KEY, YANDEX_API_KEY or YAIS_API.');

const folder = await discoverYandexFolderId({
  apiKey: key,
  keyId: String(process.env.YAIS_ID || '').trim(),
  folderId: configuredFolderId(),
});
if (!folder) {
  throw new Error('Yandex Search folder ID is missing and could not be derived. Set YANDEX_SEARCH_FOLDER_ID, YANDEX_FOLDER_ID or YAIS_FOLDER_ID.');
}

const checkpointed = await collectYandexWithCheckpoints({
  kind: 'yandex-serp-v1',
  output,
  directory: flag('--checkpoint-dir'),
  requests: queries.map(query => ({
    query, region: String(region), groupsOnPage, folder, ownDomain,
  })),
  validateResult(result, request) {
    if(result?.query !== request.query || !Array.isArray(result?.results) ||
       result.results.length > groupsOnPage) {
      throw new Error('Invalid saved SERP result for '+request.query);
    }
  },
  fetchRequest: async ({query})=>search(query,{region,groupsOnPage,key,folder}),
  onProgress: async ({index,total,request,result,reused})=>{
    console.error('SERP '+index+'/'+total+': '+request.query+' -> '+result.results.length+' results'+(reused?' [reused]':''));
    if(!reused && index < total) await sleep(REQUEST_DELAY_MS);
  },
});
const collected = checkpointed.results;

const dataset = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'yandex-search-api-v2',
  searchType: 'SEARCH_TYPE_RU',
  region: String(region),
  groupsOnPage,
  ownDomain: ownDomain || null,
  queries: collected,
};

const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(dataset, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

console.log(JSON.stringify({
  saved: destination,
  generatedAt: dataset.generatedAt,
  region: dataset.region,
  newApiCalls: checkpointed.newCalls,
  reusedApiCalls: checkpointed.reusedCalls,
  queries: dataset.queries.length,
  results: dataset.queries.reduce((sum, item) => sum + item.results.length, 0),
  note: 'New live API requests and previously saved responses are counted separately. Keep evidence and checkpoints private.',
}, null, 2));
