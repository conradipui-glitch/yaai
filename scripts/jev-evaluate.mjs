import fs from 'node:fs/promises';
import path from 'node:path';

import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { prepareJevCheckpoints } from '../lib/jev-checkpoints.mjs';
import { DEFAULT_JEV_MODEL, resolveOpenRouterApiKey } from '../lib/jev.mjs';

const args = process.argv.slice(2);

function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

if (!args.includes('--execute')) {
  throw new Error('No Jev requests sent. Add --execute explicitly after reviewing the batch size and profile.');
}

const inputPath = flag('--input');
const profilePath = flag('--profile');
const outputPath = flag('--out');
const model = flag('--model') || process.env.YAAI_JEV_MODEL || DEFAULT_JEV_MODEL;
const delayMs = Math.max(0, Math.trunc(Number(flag('--delay-ms') || 0)));
const apiKey = resolveOpenRouterApiKey();

if (!inputPath) throw new Error('Specify --input /private/evaluation-items.json.');
if (!profilePath) throw new Error('Specify --profile /path/profile.json.');
if (!outputPath) throw new Error('Specify --out /private/evaluation-results.json.');
if (!apiKey) throw new Error('YAIS_AI / OPENROUTER_API_KEY is missing.');

const input = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
const profile = JSON.parse(await fs.readFile(path.resolve(profilePath), 'utf8'));
const items = Array.isArray(input) ? input : input.items;

if (!Array.isArray(items)) {
  throw new Error('Evaluation input must be an array or an object with items array. Each item requires id + state.');
}

const checkpoint = await prepareJevCheckpoints({ outputPath, checkpointDir: flag('--checkpoint-dir') });

const dataset = await evaluateItemsWithJev({
  items,
  profile,
  checkpoint,
  model,
  apiKey,
  delayMs,
  onProgress: ({ index, total, itemId, route, cost, reused }) => {
    console.error(`Jev ${index}/${total}: ${itemId} -> ${route.needsReview ? 'review' : 'confident'} cost=${cost}${reused ? ' [reused]' : ''}`);
  },
});

const destination = path.resolve(outputPath);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(dataset, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

console.log(JSON.stringify({
  saved: destination,
  modelRequested: dataset.modelRequested,
  profileId: dataset.profile.id,
  itemCount: dataset.summary.itemCount,
  reusedCount: dataset.summary.reusedCount,
  newlyEvaluatedCount: dataset.summary.newlyEvaluatedCount,
  newMeasuredCostSubtotal: dataset.summary.newMeasuredCostSubtotal,
  needsReviewCount: dataset.summary.needsReviewCount,
  totalCost: dataset.summary.totalCost,
  totalInputTokens: dataset.summary.totalInputTokens,
}, null, 2));
