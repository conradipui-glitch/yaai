const WORDSTAT_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const FOUNDATION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

const apiKey = String(process.env.YAIS_API || process.env.YANDEX_API_KEY || '').trim();
const keyId = String(process.env.YAIS_ID || '').trim();
let folderId = String(process.env.YAIS_FOLDER_ID || process.env.YANDEX_FOLDER_ID || '').trim();

if (!apiKey) {
  console.error('SMOKE_FAIL: YAIS_API secret is missing');
  process.exit(1);
}

function extractFolderId(text) {
  const value = String(text || '');
  const patterns = [
    /service account folder ID ['"]([a-z0-9]{20})['"]/i,
    /folder ID ['"]([a-z0-9]{20})['"]/i,
    /folder[_ ]id[^a-z0-9]+([a-z0-9]{20})/i,
    /does not match with service account folder ID ['"]?([a-z0-9]{20})/i,
    /\b(b1[a-z0-9]{18})\b/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return '';
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
  return { response, data, text };
}

async function wordstat(path, body) {
  return postJson(`${WORDSTAT_BASE}${path}`, body);
}

async function discoverFolderId() {
  if (folderId) return folderId;

  // First try a free Wordstat call using the API-key ID as a deliberately wrong
  // folder candidate. Some Yandex errors include the service account folder ID.
  if (keyId) {
    const probe = await wordstat('/getRegionsTree', { folderId: keyId });
    if (probe.response.ok) return keyId;
    const fromWordstat = extractFolderId(probe.text);
    if (fromWordstat) return fromWordstat;
  }

  // Fallback: AI Studio has historically returned the real service-account
  // folder ID when a model URI contains a mismatched folder. This is only a
  // convenience probe; if Yandex stops exposing it, add YAIS_FOLDER_ID explicitly.
  const probeFolder = 'test';
  const aiProbe = await postJson(FOUNDATION_URL, {
    modelUri: `gpt://${probeFolder}/yandexgpt/latest`,
    completionOptions: { stream: false, temperature: 0, maxTokens: 1 },
    messages: [{ role: 'user', text: 'ping' }],
  });
  return extractFolderId(aiProbe.text);
}

folderId = await discoverFolderId();

if (!folderId) {
  console.error('SMOKE_NEEDS_FOLDER: YAIS_API and YAIS_ID are present, but folderId could not be derived. Add repository secret YAIS_FOLDER_ID.');
  process.exit(2);
}

const test = await wordstat('/getRegionsTree', { folderId });
if (!test.response.ok) {
  const message = test.data?.message || test.data?.error?.message || `HTTP ${test.response.status}`;
  console.error(`SMOKE_FAIL: Wordstat rejected the credentials/folder (${test.response.status}): ${message}`);
  process.exit(3);
}

const roots = Array.isArray(test.data?.regions) ? test.data.regions.length : 0;
console.log(`SMOKE_OK: Wordstat API is reachable; folderId=${folderId}; regionRoots=${roots}`);
