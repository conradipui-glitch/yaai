const API_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';

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
    /\b(b1[a-z0-9]{18})\b/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return '';
}

async function call(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
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

async function discoverFolderId() {
  if (folderId) return folderId;
  if (!keyId) return '';

  // YAIS_ID is normally the API key ID, not a folder ID. We use it only as a
  // harmless probe value because Yandex sometimes returns the service account's
  // actual folder ID in the mismatch error. If that behavior changes, this
  // simply fails and the user can add YAIS_FOLDER_ID explicitly.
  const probe = await call('/getRegionsTree', { folderId: keyId });
  if (probe.response.ok) return keyId;
  return extractFolderId(probe.text);
}

folderId = await discoverFolderId();

if (!folderId) {
  console.error('SMOKE_NEEDS_FOLDER: key is present, but folderId could not be derived. Add repository secret YAIS_FOLDER_ID.');
  process.exit(2);
}

const test = await call('/getRegionsTree', { folderId });
if (!test.response.ok) {
  const message = test.data?.message || test.data?.error?.message || `HTTP ${test.response.status}`;
  console.error(`SMOKE_FAIL: Wordstat rejected the credentials/folder (${test.response.status}): ${message}`);
  process.exit(3);
}

const roots = Array.isArray(test.data?.regions) ? test.data.regions.length : 0;
console.log(`SMOKE_OK: Wordstat API is reachable; folderId=${folderId}; regionRoots=${roots}`);
