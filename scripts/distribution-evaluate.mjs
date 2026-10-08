import fs from 'node:fs/promises';
import path from 'node:path';

import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { prepareJevCheckpoints } from '../lib/jev-checkpoints.mjs';
import { DEFAULT_JEV_MODEL, resolveOpenRouterApiKey } from '../lib/jev.mjs';
import { validateDistributionDataset } from '../lib/source-adapter.mjs';

const args = process.argv.slice(2);

function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

if (!args.includes('--execute')) {
  throw new Error('No Jev requests sent. Add --execute explicitly after reviewing the distribution batch.');
}

const inputPath = flag('--input');
const profilePath = flag('--profile');
const outputPath = flag('--out');
const model = flag('--model') || process.env.YAAI_JEV_MODEL || DEFAULT_JEV_MODEL;
const maxChars = Math.max(500, Math.min(100000, Math.trunc(Number(flag('--max-chars') || 24000))));
const limit = Math.max(1, Math.min(1000, Math.trunc(Number(flag('--limit') || 100))));
const apiKey = resolveOpenRouterApiKey();

if (!inputPath) throw new Error('Specify --input /private/distribution-evidence.json.');
if (!profilePath) throw new Error('Specify --profile /path/profile.json.');
if (!outputPath) throw new Error('Specify --out /private/distribution-evaluations.json.');
if (!apiKey) throw new Error('YAIS_AI / OPENROUTER_API_KEY is missing.');

const evidence = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
validateDistributionDataset(evidence);
const profile = JSON.parse(await fs.readFile(path.resolve(profilePath), 'utf8'));
const entities = new Map((evidence.entities || []).map((entity) => [entity.id, entity]));

const items = (evidence.contentItems || []).slice(0, limit).map((item) => {
  const entity = entities.get(item.entityId);
  return {
    id: item.id,
    meta: {
      platform: item.platform,
      type: item.type,
      url: item.url,
      entityId: item.entityId,
      entityName: entity?.name || '',
    },
    state: {
      platform: item.platform,
      contentType: item.type,
      sourceEntity: entity?.name || '',
      title: item.title || '',
      text: String(item.text || '').slice(0, maxChars),
      outboundLinks: item.outboundLinks || [],
      publishedAt: item.publishedAt || null,
    },
  };
});

if (!items.length) throw new Error('Distribution evidence contains no content items.');

const checkpoint = await prepareJevCheckpoints({ outputPath, checkpointDir: flag('--checkpoint-dir') });

const dataset = await evaluateItemsWithJev({
  items,
  profile,
  checkpoint,
  model,
  apiKey,
  onProgress: ({ index, total, itemId, route, cost, reused }) => {
    console.error(`Jev distribution ${index}/${total}: ${itemId} -> ${route.needsReview ? 'review' : 'confident'} cost=${cost}${reused ? ' [reused]' : ''}`);
  },
});

dataset.input = {
  type: 'distribution-evidence',
  platform: evidence.platform,
  source: evidence.source,
  generatedAt: evidence.generatedAt,
  evaluatedItems: items.length,
  maxChars,
};

const destination = path.resolve(outputPath);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(dataset, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

console.log(JSON.stringify({
  saved: destination,
  platform: evidence.platform,
  profileId: dataset.profile.id,
  itemCount: dataset.summary.itemCount,
  reusedCount: dataset.summary.reusedCount,
  newlyEvaluatedCount: dataset.summary.newlyEvaluatedCount,
  newMeasuredCostSubtotal: dataset.summary.newMeasuredCostSubtotal,
  needsReviewCount: dataset.summary.needsReviewCount,
  totalCost: dataset.summary.totalCost,
}, null, 2));
