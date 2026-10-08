import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const CASES = Object.freeze({
  roofing: { topic: 'кровельные работы', seeds: ['кровельные работы', 'ремонт кровли'],
    queries: ['кровельные работы омск цена', 'течет крыша что делать ремонт кровли'] },
  screed: { topic: 'полусухая стяжка', seeds: ['полусухая стяжка', 'полусухая стяжка цена'],
    queries: ['полусухая стяжка омск цена', 'полусухая стяжка трещины причины'] },
  facades: { topic: 'фасадные работы', seeds: ['фасадные работы', 'утепление фасада'],
    queries: ['фасадные работы омск цена', 'утепление фасада ошибки и проблемы'] },
});

export const STAGES = ['wordstat', 'query-plan', 'serp', 'jev', 'review', 'quality'];
export const PAID_STAGES = ['wordstat', 'serp', 'jev'];
const REGION_ID = '11318';
const STAGE_FILES = {
  wordstat: ['wordstat.json'],
  'query-plan': ['query-plan.json', 'query-plan.txt'],
  serp: ['serp.json'],
  jev: ['pain-map.json', 'pain-map.md', 'jev-evidence.json'],
  review: ['review-unlabeled.json'],
  quality: ['quality.json'],
};
const CHECKPOINT_DIRS = ['wordstat.json.yandex-checkpoints',
  'serp.json.yandex-checkpoints', 'pain-map.json.jev-checkpoints'];
const fileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fail(message) { throw new Error(message); }
function requireTrue(condition, message) { if (!condition) fail(message); }
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

export async function fingerprintOmskStudy(code, {
  env = process.env, repository = fileRoot,
} = {}) {
  const scenario = CASES[code];
  if (!scenario) fail('Unknown Omsk research case: ' + code);
  const checkedFiles = ['examples/evaluation-profiles/pain-discovery.json',
    'scripts/pain-wordstat.mjs', 'scripts/pain-prepare.mjs',
    'scripts/serp-collect.mjs', 'scripts/pain-analyze.mjs',
    'lib/pain-discovery.mjs', 'lib/evaluation.mjs'];
  const fileHashes = {};
  for (const name of checkedFiles) {
    fileHashes[name] = hash(await fs.readFile(path.join(repository, name)));
  }
  return hash(JSON.stringify({
    protocolVersion: 1, scenario, code, regionId: REGION_ID,
    phraseLimit: 35, queryPlanLimit: 4, serpGroups: 5,
    jevLimit: 8, sampleSize: 8, targetLabels: 8,
    modelRequested: String(env.YAAI_JEV_MODEL || 'typesafe/jev-1.13'),
    fileHashes,
  }));
}

export async function inspectOmskStudy(directory, code, fingerprint) {
  const scenario = CASES[code];
  if (!scenario) fail('Unknown Omsk research case: ' + code);
  const root = path.resolve(directory);
  const read = async name => {
    try { return await fs.readFile(path.join(root, name), 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const parsed = async name => {
    const raw = await read(name);
    try { return JSON.parse(raw); }
    catch { fail('Malformed saved evidence: ' + name); }
  };
  const completed = [];
  for (const stage of STAGES) {
    const files = STAGE_FILES[stage];
    const present = await Promise.all(files.map(read));
    if (present.some(x => x !== null) && present.some(x => x === null)) {
      fail('Incomplete saved Omsk stage ' + stage + '; no paid calls allowed.');
    }
    if (present.every(x => x !== null)) completed.push(stage);
  }
  const checkpointNames = [];
  for (const dir of CHECKPOINT_DIRS) {
    try {
      if ((await fs.readdir(path.join(root, dir))).length) checkpointNames.push(dir);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const manifestRaw = await read('omsk-resume-manifest.json');
  if (!manifestRaw && (completed.length || checkpointNames.length)) {
    fail('Saved Omsk artifacts lack a verified resume manifest. Cannot use legacy data.');
  }
  if (manifestRaw) {
    let m;
    try { m = JSON.parse(manifestRaw); }
    catch { fail('Malformed Omsk resume manifest.'); }
    requireTrue(m?.version === 1 && m?.code === code && m?.fingerprint === fingerprint,
      'Incompatible Omsk resume manifest (case, code, model or profile has changed).');
  }
  let gap = false;
  for (const stage of STAGES) {
    if (!completed.includes(stage)) gap = true;
    else if (gap) fail('Invalid Omsk stage ordering; later output exists before earlier stage.');
  }

  if (completed.includes('wordstat')) {
    const w = await parsed('wordstat.json');
    requireTrue(w?.schemaVersion === 1 && w.source === 'yandex-wordstat-topRequests' &&
      equal(w.seeds, scenario.seeds) && w.regions?.length === 1 &&
      String(w.regions[0].id) === REGION_ID &&
      Array.isArray(w.calls) && w.calls.length === scenario.seeds.length &&
      equal(w.calls.map(x => x.seed), scenario.seeds) && Array.isArray(w.rows),
      'Saved Omsk Wordstat evidence does not match case, seeds or region.');
  }
  if (completed.includes('query-plan')) {
    const plan = await parsed('query-plan.json');
    const lines = (await read('query-plan.txt')).split(/\r?\n/).filter(Boolean);
    requireTrue(plan?.schemaVersion === 1 && plan?.topic === scenario.topic &&
      plan.source === 'yaai-pain-query-plan' && Array.isArray(plan.queries) &&
      plan.queries.length <= 4 && equal(lines, plan.queries.map(x => x.query)),
      'Saved Omsk query plan is inconsistent.');
  }
  if (completed.includes('serp')) {
    const serp = await parsed('serp.json');
    requireTrue(serp?.schemaVersion === 1 && serp.source === 'yandex-search-api-v2' &&
      String(serp.region) === REGION_ID && Number(serp.groupsOnPage) === 5 &&
      Array.isArray(serp.queries) && equal(serp.queries.map(q => q.query), scenario.queries) &&
      serp.queries.every(q => Array.isArray(q.results)),
      'Saved Omsk SERP evidence does not match region or preselected queries.');
  }
  if (completed.includes('jev')) {
    const m = await parsed('pain-map.json');
    const j = await parsed('jev-evidence.json');
    const w = await parsed('wordstat.json');
    const s = await parsed('serp.json');
    requireTrue(m?.source === 'yaai-pain-discovery' && m.topic === scenario.topic &&
      Array.isArray(m.evidenceLedger) &&
      m.input?.wordstatGeneratedAt === w.generatedAt &&
      m.input?.serpGeneratedAt === s.generatedAt &&
      j?.schemaVersion === 1 && j.profile?.id && Array.isArray(j.evaluations) &&
      j.evaluations.length <= 8 && j.evaluations.length === m.input?.classifiedCount,
      'Saved Omsk Jev evidence does not match sources or limits.');
  }
  if (completed.includes('review')) {
    const r = await parsed('review-unlabeled.json');
    requireTrue(Array.isArray(r?.items) && r.items.length <= 8 &&
      r.items.every(x => x.label?.isPain == null),
      'Saved Omsk blind review is inconsistent or includes non-blind labels.');
  }
  if (completed.includes('quality')) {
    const q = await parsed('quality.json');
    requireTrue(q && typeof q === 'object' && q.status,
      'Saved Omsk quality report is invalid.');
  }
  return {
    root, code, completed,
    pending: STAGES.filter(x => !completed.includes(x)),
    pendingPaid: PAID_STAGES.filter(x => !completed.includes(x)),
    hasManifest: manifestRaw !== null,
    checkpoints: checkpointNames,
  };
}

export async function runOmskStudy({
  code, directory, execute = false, env = process.env, invoke,
  repository = fileRoot,
} = {}) {
  requireTrue(CASES[code], 'Unknown Omsk research case: ' + code);
  requireTrue(directory, 'Provide an explicit research --dir.');
  requireTrue(typeof invoke === 'function', 'Missing Omsk stage executor.');
  const fingerprint = await fingerprintOmskStudy(code, { env, repository });
  let state = await inspectOmskStudy(directory, code, fingerprint);

  // Fail BEFORE beginning the run if even one paid stage is still missing.
  if (!execute && state.pendingPaid.length) {
    fail('PAID CALLS BLOCKED: ' + state.pendingPaid.join(', ') +
      '. Set confirm_paid_requests=true explicitly in the manual Actions run.');
  }
  if (!state.hasManifest) {
    await fs.mkdir(state.root, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(state.root, 'omsk-resume-manifest.json'),
      JSON.stringify({ version: 1, code, fingerprint }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
  }
  for (const stage of STAGES) {
    if (state.completed.includes(stage)) continue;
    console.error('Omsk ' + code + ': ' + stage +
      (PAID_STAGES.includes(stage) ? ' [authorized paid-capable stage]' : ' [offline]'));
    await invoke(stage, state.root, CASES[code]);
    state = await inspectOmskStudy(directory, code, fingerprint);
    requireTrue(state.completed.includes(stage),
      'Omsk stage ' + stage + ' did not produce all required output files.');
  }
  return state;
}

async function runStage(stage, root, scenario, env) {
  const dest = name => path.join(root, name);
  const cmd = {
    wordstat: ['scripts/pain-wordstat.mjs', '--seeds', scenario.seeds.join(','),
      '--region', REGION_ID, '--num-phrases', '35', '--out', dest('wordstat.json'), '--execute'],
    'query-plan': ['scripts/pain-prepare.mjs', '--topic', scenario.topic,
      '--wordstat', dest('wordstat.json'), '--limit', '4', '--out', dest('query-plan.json'),
      '--query-file', dest('query-plan.txt')],
    serp: ['scripts/serp-collect.mjs', '--queries', scenario.queries.join(','),
      '--region', REGION_ID, '--groups', '5', '--out', dest('serp.json'), '--execute'],
    jev: ['scripts/pain-analyze.mjs', '--topic', scenario.topic,
      '--wordstat', dest('wordstat.json'), '--serp', dest('serp.json'),
      '--limit', '8', '--out', dest('pain-map.json'), '--md', dest('pain-map.md'),
      '--evaluation-out', dest('jev-evidence.json'), '--execute'],
    review: ['scripts/pain-review.mjs', '--map', dest('pain-map.json'),
      '--sample-size', '8', '--out', dest('review-unlabeled.json')],
    quality: ['scripts/pain-quality.mjs', '--map', dest('pain-map.json'),
      '--review', dest('review-unlabeled.json'), '--target-labels', '8',
      '--out', dest('quality.json')],
  }[stage];
  if (!cmd) fail('Unexpected Omsk stage: ' + stage);
  const p = spawnSync(process.execPath, cmd, { cwd: fileRoot, env, stdio: 'inherit' });
  if (p.error) throw p.error;
  if (p.status !== 0) fail('Omsk stage failed: ' + stage + ' (exit ' + p.status + ').');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = name => {
    const index = args.indexOf(name);
    return index < 0 ? null : args[index + 1];
  };
  runOmskStudy({
    code: flag('--case'),
    directory: flag('--dir'),
    execute: args.includes('--execute'),
    invoke: (stage, root, scenario) => runStage(stage, root, scenario, process.env),
  }).then(state => {
    console.log(JSON.stringify({
      case: state.code, completed: state.completed,
      pending: state.pending, savedCheckpoints: state.checkpoints,
    }, null, 2));
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
