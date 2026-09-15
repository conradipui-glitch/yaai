import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, '.data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const API_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const REQUEST_DELAY_MS = 400;
const MAX_SEEDS = 40;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

await loadEnvFile();
await loadLegacyCredentialsFile();
const PORT = Number(process.env.PORT || 8787);

let cache = await loadCache();

async function loadEnvFile() {
  try {
    const text = await fs.readFile(path.join(__dirname, '.env'), 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Could not read .env:', error.message);
  }
}

async function loadLegacyCredentialsFile() {
  const credentialsPath = process.env.YANDEX_CREDENTIALS_FILE
    ? path.resolve(process.env.YANDEX_CREDENTIALS_FILE)
    : path.join(__dirname, 'я.txt');
  try {
    const text = await fs.readFile(credentialsPath, 'utf8');
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!process.env.YANDEX_API_KEY && lines[0]) process.env.YANDEX_API_KEY = lines[0];
    if (!process.env.YANDEX_KEY_ID && lines[1]) process.env.YANDEX_KEY_ID = lines[1];
    if (!process.env.YANDEX_FOLDER_ID && lines[2]) process.env.YANDEX_FOLDER_ID = lines[2];
    console.log('Loaded Yandex credentials from local credentials file (values hidden).');
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Could not read credentials file:', error.message);
  }
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveCache() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhrase(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizeSeeds(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/\r?\n|,/);
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const phrase = String(item || '').trim();
    if (!phrase) continue;
    const key = normalizePhrase(phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
  }
  return result;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(text);
}

function getApiKey() {
  return process.env.YANDEX_API_KEY?.trim() || '';
}

function getFolderId(requestFolderId) {
  return String(requestFolderId || process.env.YANDEX_FOLDER_ID || '').trim();
}

async function yandexRequest(endpoint, payload = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const error = new Error('YANDEX_API_KEY is not configured on the server');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    const message = data?.message || data?.error?.message || data?.details || `Yandex API returned HTTP ${response.status}`;
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function cacheKey({ seed, regionId, device, numPhrases, folderId }) {
  return JSON.stringify([normalizePhrase(seed), String(regionId || ''), device, numPhrases, folderId]);
}

async function getTop({ seed, regionId, device, numPhrases, folderId, useCache = true }) {
  const key = cacheKey({ seed, regionId, device, numPhrases, folderId });
  const cached = cache[key];
  if (useCache && cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return { ...cached.data, _cached: true };
  }

  const payload = {
    phrase: seed,
    numPhrases,
    devices: [device],
    folderId,
  };
  if (regionId) payload.regions = [String(regionId)];

  const data = await yandexRequest('/topRequests', payload);
  cache[key] = { savedAt: Date.now(), data };
  await saveCache();
  return { ...data, _cached: false };
}

function mergeWordstatRows(calls) {
  const rows = new Map();

  for (const call of calls) {
    const groups = [
      ['top', call.data.results || []],
      ['association', call.data.associations || []],
    ];

    for (const [type, items] of groups) {
      for (const item of items) {
        const phrase = String(item.phrase || '').trim();
        if (!phrase) continue;
        const key = `${call.region.id}|${normalizePhrase(phrase)}`;
        const count = Number(item.count || 0);
        const existing = rows.get(key) || {
          phrase,
          regionId: String(call.region.id),
          regionName: call.region.name || String(call.region.id),
          count: 0,
          types: new Set(),
          seeds: new Set(),
        };
        existing.count = Math.max(existing.count, Number.isFinite(count) ? count : 0);
        existing.types.add(type);
        existing.seeds.add(call.seed);
        rows.set(key, existing);
      }
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      types: [...row.types].sort(),
      seeds: [...row.seeds].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, 'ru'));
}

function flattenRegions(nodes, parents = [], out = []) {
  for (const node of nodes || []) {
    const currentParents = [...parents, node.name].filter(Boolean);
    out.push({
      id: String(node.id),
      name: node.name,
      path: currentParents.join(' → '),
    });
    flattenRegions(node.children || [], currentParents, out);
  }
  return out;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, {
        hasApiKey: Boolean(getApiKey()),
        hasFolderId: Boolean(getFolderId()),
        defaultFolderId: getFolderId() || null,
        maxSeeds: MAX_SEEDS,
        cacheTtlHours: CACHE_TTL_MS / 3_600_000,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/test') {
      const body = await readJsonBody(req);
      const folderId = getFolderId(body.folderId);
      if (!folderId) return json(res, 400, { error: 'folderId is required' });
      const data = await yandexRequest('/getRegionsTree', { folderId });
      return json(res, 200, { ok: true, regionRoots: data.regions?.length || 0 });
    }

    if (req.method === 'POST' && url.pathname === '/api/regions') {
      const body = await readJsonBody(req);
      const folderId = getFolderId(body.folderId);
      if (!folderId) return json(res, 400, { error: 'folderId is required' });
      const data = await yandexRequest('/getRegionsTree', { folderId });
      return json(res, 200, { regions: flattenRegions(data.regions || []) });
    }

    if (req.method === 'POST' && url.pathname === '/api/batch') {
      const body = await readJsonBody(req);
      const seeds = sanitizeSeeds(body.seeds);
      const regions = Array.isArray(body.regions) ? body.regions.filter((r) => r && r.id) : [];
      const folderId = getFolderId(body.folderId);
      const numPhrases = Math.min(2000, Math.max(1, Number(body.numPhrases || 100)));
      const allowedDevices = new Set(['DEVICE_ALL', 'DEVICE_DESKTOP', 'DEVICE_PHONE', 'DEVICE_TABLET']);
      const device = allowedDevices.has(body.device) ? body.device : 'DEVICE_ALL';
      const useCache = body.useCache !== false;

      if (!folderId) return json(res, 400, { error: 'folderId is required' });
      if (!seeds.length) return json(res, 400, { error: 'Add at least one seed phrase' });
      if (seeds.length > MAX_SEEDS) return json(res, 400, { error: `Maximum ${MAX_SEEDS} seed phrases per run` });
      if (!regions.length) return json(res, 400, { error: 'Select at least one region' });
      if (seeds.length * regions.length > 100) {
        return json(res, 400, { error: 'This run would exceed 100 Wordstat calls. Reduce seeds or regions.' });
      }

      const calls = [];
      let apiCalls = 0;
      let cachedCalls = 0;

      for (const seed of seeds) {
        for (const region of regions) {
          const data = await getTop({ seed, regionId: region.id, device, numPhrases, folderId, useCache });
          calls.push({ seed, region: { id: String(region.id), name: region.name || String(region.id) }, data });
          if (data._cached) cachedCalls += 1;
          else {
            apiCalls += 1;
            await delay(REQUEST_DELAY_MS);
          }
        }
      }

      const rows = mergeWordstatRows(calls);
      return json(res, 200, {
        meta: {
          seeds: seeds.length,
          regions: regions.length,
          requestedCalls: seeds.length * regions.length,
          apiCalls,
          cachedCalls,
          rows: rows.length,
          numPhrases,
          device,
          generatedAt: new Date().toISOString(),
        },
        rows,
      });
    }

    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      if (await serveStatic(req, res)) return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(res, error.status || 500, {
      error: error.message || 'Unexpected error',
      details: error.details || undefined,
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`yaai Wordstat batch tool: http://127.0.0.1:${PORT}`);
  console.log(`API key configured: ${getApiKey() ? 'yes' : 'no'}`);
  console.log(`Folder ID configured: ${getFolderId() ? 'yes' : 'no'}`);
});
