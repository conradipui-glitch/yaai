import { discoverYandexFolderId } from '../lib/yandex-folder.mjs';

const WORDSTAT_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';

const apiKey = String(process.env.YAIS_API || process.env.YANDEX_API_KEY || '').trim();
const keyId = String(process.env.YAIS_ID || '').trim();
let folderId = String(process.env.YAIS_FOLDER_ID || process.env.YANDEX_FOLDER_ID || '').trim();

if (!apiKey) {
  console.error('SMOKE_FAIL: YAIS_API secret is missing');
  process.exit(1);
}

async function postJson(url, body) {
  const response = await fetch(url, {
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
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  return { response, data };
}

folderId = await discoverYandexFolderId({
  apiKey,
  keyId,
  folderId,
});

if (!folderId) {
  console.error('SMOKE_NEEDS_FOLDER: API key is present, but folderId could not be derived. Add repository secret YAIS_FOLDER_ID.');
  process.exit(2);
}

const test = await postJson(`${WORDSTAT_BASE}/getRegionsTree`, { folderId });
if (!test.response.ok) {
  const message = test.data?.message || test.data?.error?.message || `HTTP ${test.response.status}`;
  console.error(`SMOKE_FAIL: Wordstat rejected the credentials/folder (${test.response.status}): ${message}`);
  process.exit(3);
}

const roots = Array.isArray(test.data?.regions) ? test.data.regions.length : 0;
console.log(`SMOKE_OK: Wordstat API is reachable; folderId=${folderId}; regionRoots=${roots}`);
