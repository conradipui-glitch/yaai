const WORDSTAT_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const FOUNDATION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

export function extractYandexFolderId(text) {
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

async function postJson(fetchImpl, apiKey, url, body) {
  const response = await fetchImpl(url, {
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

export async function discoverYandexFolderId({
  apiKey,
  keyId = '',
  folderId = '',
  fetchImpl = fetch,
  wordstatBase = WORDSTAT_BASE,
  foundationUrl = FOUNDATION_URL,
} = {}) {
  const key = String(apiKey || '').trim();
  const explicit = String(folderId || '').trim();
  const id = String(keyId || '').trim();

  if (explicit) return explicit;
  if (!key) return '';

  if (id) {
    const probe = await postJson(fetchImpl, key, `${wordstatBase}/getRegionsTree`, { folderId: id });
    if (probe.response.ok) return id;
    const fromWordstat = extractYandexFolderId(probe.text);
    if (fromWordstat) return fromWordstat;
  }

  const aiProbe = await postJson(fetchImpl, key, foundationUrl, {
    modelUri: 'gpt://test/yandexgpt/latest',
    completionOptions: { stream: false, temperature: 0, maxTokens: 1 },
    messages: [{ role: 'user', text: 'ping' }],
  });
  return extractYandexFolderId(aiProbe.text);
}
