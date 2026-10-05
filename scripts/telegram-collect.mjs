import fs from 'node:fs/promises';
import path from 'node:path';

import { buildTelegramDistributionDataset } from '../lib/adapters/telegram.mjs';
import { validateDistributionDataset } from '../lib/source-adapter.mjs';

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

function normalizeChannel(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(?:www\.)?t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
}

function scalar(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reactionCount(reactions) {
  const results = Array.isArray(reactions?.results) ? reactions.results : [];
  return results.reduce((sum, item) => sum + (scalar(item?.count) || 0), 0);
}

function extractUrls(message) {
  const found = new Set();
  const text = String(message?.message || '');

  for (const match of text.matchAll(/https?:\/\/[^\s<>()\[\]{}"']+/gi)) {
    found.add(match[0].replace(/[.,!?;:]+$/, ''));
  }

  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 6 || value == null) return;
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) found.add(value);
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) {
      found.add(value.url);
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    for (const key of ['rows', 'buttons', 'button', 'type']) {
      if (key in value) visit(value[key], depth + 1);
    }
  };

  visit(message?.replyMarkup);
  return [...found];
}

function messageDate(message) {
  const value = message?.date;
  if (value instanceof Date) return value.toISOString();

  const numeric = scalar(value);
  if (numeric != null) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(millis).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mergeEvidence(previous, current) {
  if (!previous) return current;
  validateDistributionDataset(previous);
  validateDistributionDataset(current);

  if (previous.platform !== 'telegram') {
    throw new Error('Previous evidence is not Telegram distribution evidence.');
  }

  const byId = (rows) => new Map(rows.map((row) => [row.id, row]));

  const entities = byId(previous.entities || []);
  for (const row of current.entities || []) entities.set(row.id, row);

  const content = byId(previous.contentItems || []);
  for (const row of current.contentItems || []) content.set(row.id, row);

  const snapshotUnion = (a = [], b = [], idKey) => {
    const map = new Map();
    for (const row of [...a, ...b]) {
      map.set(`${row[idKey]}|${row.observedAt}`, row);
    }
    return [...map.values()].sort((x, y) => String(x.observedAt).localeCompare(String(y.observedAt)));
  };

  return {
    ...current,
    queries: [...new Set([...(previous.queries || []), ...(current.queries || [])])],
    entities: [...entities.values()],
    contentItems: [...content.values()],
    metricsSnapshots: snapshotUnion(previous.metricsSnapshots, current.metricsSnapshots, 'contentId'),
    entityMetricsSnapshots: snapshotUnion(previous.entityMetricsSnapshots, current.entityMetricsSnapshots, 'entityId'),
    sourceMeta: {
      ...(current.sourceMeta || {}),
      previousEvidenceMerged: true,
      previousGeneratedAt: previous.generatedAt || null,
    },
  };
}

if (!args.includes('--execute')) {
  throw new Error('No Telegram requests sent. Add --execute explicitly after reviewing channels and post limit.');
}

const apiId = Number(process.env.TELEGRAM_API_ID || '');
const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
const sessionFile = flag('--session-file') || process.env.TELEGRAM_SESSION_FILE;
const output = flag('--out');
const previousPath = flag('--previous');
const limit = Math.max(1, Math.min(200, Math.trunc(Number(flag('--limit') || 50))));
const channels = [...new Set(csv(flag('--channels')).map(normalizeChannel).filter(Boolean))];
const researchQueries = csv(flag('--research-queries'));

if (!Number.isSafeInteger(apiId) || apiId <= 0) throw new Error('TELEGRAM_API_ID is missing or invalid.');
if (!apiHash) throw new Error('TELEGRAM_API_HASH is missing.');
if (!sessionFile) throw new Error('Specify --session-file /private/telegram.session or TELEGRAM_SESSION_FILE.');
if (!output) throw new Error('Specify --out /private/telegram-evidence.json.');
if (!channels.length) throw new Error('Provide --channels channel1,channel2.');
if (channels.length > 50) throw new Error('Maximum 50 channels per run. Split larger research batches.');

const sessionString = (await fs.readFile(path.resolve(sessionFile), 'utf8')).trim();
if (!sessionString) throw new Error('Telegram session file is empty.');

const { TelegramClient, utils } = await import('teleproto');
const { StringSession } = await import('teleproto/sessions');

const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
  connectionRetries: 5,
});

const generatedAt = new Date().toISOString();
const channelBundles = [];

try {
  await client.connect();
  await client.getMe();

  for (let index = 0; index < channels.length; index += 1) {
    const username = channels[index];
    const target = `https://t.me/${username}`;
    const entity = await client.getEntity(target);

    const entityId = String(entity?.id ?? '').trim();
    const resolvedUsername = String(entity?.username || username).replace(/^@/, '');

    if (!entityId || !resolvedUsername) {
      console.error(`Telegram ${index + 1}/${channels.length}: skip ${username} (not a public channel)`);
      continue;
    }

    let fullChat = null;
    try {
      const full = await client.api.channels.getFullChannel({
        channel: utils.getInputChannel(entity),
      });
      fullChat = full?.fullChat || null;
    } catch (error) {
      console.error(`Telegram channel info warning for @${resolvedUsername}: ${error?.message || error}`);
    }

    const posts = [];

    for await (const message of client.iterMessages(entity, { limit })) {
      const messageId = String(message?.id ?? '').trim();
      if (!messageId) continue;

      posts.push({
        id: messageId,
        text: String(message?.message || ''),
        publishedAt: messageDate(message),
        views: scalar(message?.views),
        forwards: scalar(message?.forwards),
        reactions: reactionCount(message?.reactions),
        comments: scalar(message?.replies?.replies),
        outboundLinks: extractUrls(message),
      });
    }

    channelBundles.push({
      channel: {
        id: entityId,
        username: resolvedUsername,
        title: String(entity?.title || resolvedUsername),
        description: String(fullChat?.about || ''),
        subscribers: scalar(fullChat?.participantsCount),
        online: scalar(fullChat?.onlineCount),
      },
      posts,
    });

    console.error(`Telegram ${index + 1}/${channels.length}: @${resolvedUsername} -> ${posts.length} posts`);
  }
} finally {
  await client.disconnect().catch(() => {});
}

const current = buildTelegramDistributionDataset({
  generatedAt,
  researchQueries,
  channelBundles,
});

let previous = null;
if (previousPath) {
  previous = JSON.parse(await fs.readFile(path.resolve(previousPath), 'utf8'));
}

const dataset = mergeEvidence(previous, current);
validateDistributionDataset(dataset);

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
  entityMetricsSnapshots: dataset.entityMetricsSnapshots.length,
  note: 'Read-only public Telegram research using an authenticated MTProto session. Keep the session file private.',
}, null, 2));
