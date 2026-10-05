import fs from 'node:fs/promises';
import path from 'node:path';

import { analyzeDistributionEvidence } from '../lib/distribution-evidence.mjs';

const args = process.argv.slice(2);

function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const input = flag('--input');
const output = flag('--out');

if (!input) throw new Error('Specify --input /private/distribution-evidence.json.');

const source = path.resolve(input);
const dataset = JSON.parse(await fs.readFile(source, 'utf8'));
const analysis = analyzeDistributionEvidence(dataset);

if (output) {
  const destination = path.resolve(output);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(analysis, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

console.log(JSON.stringify({
  source,
  saved: output ? path.resolve(output) : null,
  platform: analysis.meta.platform,
  queryCount: analysis.meta.queryCount,
  entityCount: analysis.meta.entityCount,
  contentCount: analysis.meta.contentCount,
  metricsSnapshotCount: analysis.meta.metricsSnapshotCount,
  multiSnapshotContentCount: analysis.meta.multiSnapshotContentCount,
}, null, 2));
