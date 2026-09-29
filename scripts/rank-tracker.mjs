import fs from 'node:fs/promises';
import path from 'node:path';

import { analyzeRankTrackerCsv } from '../lib/rank-tracker.mjs';

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
  throw new Error('Usage: npm run rank:track -- --input /private/webmaster.csv --out /private/rank-tracker.json [--min-impressions 5] [--striking-start 5] [--striking-end 20]');
}

const minImpressions = Number(flag('--min-impressions') || 1);
const strikingStart = Number(flag('--striking-start') || 5);
const strikingEnd = Number(flag('--striking-end') || 20);

if (!Number.isSafeInteger(minImpressions) || minImpressions < 1) {
  throw new Error('--min-impressions must be a positive integer.');
}
if (!Number.isFinite(strikingStart) || strikingStart < 1) {
  throw new Error('--striking-start must be >= 1.');
}
if (!Number.isFinite(strikingEnd) || strikingEnd < strikingStart) {
  throw new Error('--striking-end must be >= --striking-start.');
}

const csv = await fs.readFile(path.resolve(input), 'utf8');
const result = analyzeRankTrackerCsv(csv, { minImpressions, strikingStart, strikingEnd });

const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

console.log(JSON.stringify({
  saved: destination,
  currentDate: result.meta.currentDate,
  previousDate: result.meta.previousDate,
  queryCount: result.current.queryCount,
  improvements: result.comparison.improvements.length,
  declines: result.comparison.declines.length,
  strikingDistance: result.comparison.strikingDistance.length,
  note: result.meta.note,
}, null, 2));
