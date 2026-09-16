import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeWebmasterCsv } from '../lib/webmaster-overlap.mjs';

const args = process.argv.slice(2);
function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const input = flag('--input');
const output = flag('--out');
if (!input || !output) throw new Error('Usage: npm run webmaster:overlap -- --input /private/report.csv --out /private/overlaps.json [--min-impressions 1]');
const threshold = Number(flag('--min-impressions') || 1);
if (!Number.isSafeInteger(threshold) || threshold < 1) throw new Error('--min-impressions must be a positive integer.');
const csv = await fs.readFile(path.resolve(input), 'utf8');
const result = analyzeWebmasterCsv(csv, { minImpressions: threshold });
const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ saved: destination, inputRows: result.inputRows,
  candidateCount: result.candidateCount, note: result.note }, null, 2));
