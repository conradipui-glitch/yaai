import fs from 'node:fs/promises';
import path from 'node:path';

import { analyzeSerpEvidence } from '../lib/serp-evidence.mjs';

const args = process.argv.slice(2);
function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const input = flag('--input');
const output = flag('--out');
if (!input || !output) {
  throw new Error('Usage: npm run serp:analyze -- --input /private/serp-evidence.json --out /private/serp-analysis.json [--own-domain example.ru] [--top 10]');
}

const dataset = JSON.parse(await fs.readFile(path.resolve(input), 'utf8'));
const result = analyzeSerpEvidence(dataset, {
  ownDomain: flag('--own-domain') || dataset.ownDomain || '',
  topN: Number(flag('--top') || 10),
});

const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

console.log(JSON.stringify({
  saved: destination,
  queryCount: result.meta.queryCount,
  ownDomain: result.meta.ownDomain,
  ownAbsentQueries: result.own.absentQueries,
  competitorDomains: result.competitors.length,
}, null, 2));
