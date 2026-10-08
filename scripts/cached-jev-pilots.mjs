import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CASES as OMSK_CASES } from './omsk-pain-resume.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = 'examples/evaluation-profiles/pain-discovery.json';
const HASHED_FILES = [
  PROFILE, 'scripts/pain-analyze.mjs', 'scripts/pain-review.mjs',
  'scripts/pain-quality.mjs', 'scripts/omsk-pain-resume.mjs', 'lib/pain-discovery.mjs',
  'lib/evaluation.mjs', 'lib/pain-quality.mjs', 'lib/jev.mjs',
];
const OMSK_TOPICS = Object.freeze({
  roofing: 'кровельные работы',
  screed: 'полусухая стяжка',
  facades: 'фасадные работы',
});
const RELEVANT = /^(?:почему\s+|альтернатива\s+)?обработка\s+заявок(?:\s|$)/iu;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (ok, message) => { if (!ok) throw Error(message); };
const read = async file => fs.readFile(file, 'utf8');
async function maybeRead(file) {
  try { return await read(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function parse(raw, label) {
  try {
    const value = JSON.parse(raw);
    check(value && typeof value === 'object', 'Invalid JSON object: ' + label);
    return value;
  } catch (error) { throw Error('Invalid saved JSON (' + label + '): ' + error.message); }
}
async function saveExclusive(file, object) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify(object, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
}

export function configFor(mode, code = null) {
  if (mode === 'omsk') {
    check(Object.hasOwn(OMSK_TOPICS, code), 'Unknown cached Omsk classification case.');
    return {
      mode, code, topic: OMSK_TOPICS[code], limit: 8,
      reviewSize: 8, minReviewSize: 0, targetLabels: 8,
      files: { jev: ['pain-map.json', 'pain-map.md', 'jev-evidence.json'],
        review: ['review-unlabeled.json'], quality: ['quality.json'] },
      stages: ['jev', 'review', 'quality'],
    };
  }
  if (mode === 'relevance' && !code) {
    return {
      mode, code: null, topic: 'обработка заявок', limit: 90,
      reviewSize: 80, minReviewSize: 50, targetLabels: 50,
      files: { filter: ['serp.json'],
        jev: ['pain-map.json', 'pain-map.md', 'jev-evidence.json'],
        review: ['review-unlabeled.json'],
        quality: ['quality-unlabeled.json', 'quality-unlabeled.md'] },
      stages: ['filter', 'jev', 'review', 'quality'],
    };
  }
  throw Error('Unknown cached Jev pilot. Expected --mode omsk --case roofing|screed|facades or --mode relevance.');
}

export async function inspectSource({ mode, code, source, repository = REPO, env = process.env }) {
  const cfg = configFor(mode, code);
  const root = path.resolve(source);
  const evidenceFiles = mode === 'omsk'
    ? ['wordstat.json', 'serp.json'] : ['serp.json'];
  const texts = {};
  const data = {};
  for (const name of evidenceFiles) {
    texts[name] = await read(path.join(root, name));
    data[name] = parse(texts[name], name);
  }
  const serp = data['serp.json'];
  check(serp?.source === 'yandex-search-api-v2' &&
    Array.isArray(serp.queries) && serp.queries.every(row =>
      typeof row.query === 'string' && Array.isArray(row.results)),
    'Source SERP evidence is invalid; no Jev requests allowed.');
  let selectedSerp = serp;
  if (mode === 'omsk') {
    const wordstat = data['wordstat.json'];
    check(wordstat?.source === 'yandex-wordstat-topRequests' &&
      wordstat.schemaVersion === 1 && Array.isArray(wordstat.rows) &&
      Array.isArray(wordstat.seeds) && wordstat.seeds.length >= 1 &&
      wordstat.regions?.length === 1 && String(wordstat.regions[0].id) === '11318' &&
      String(serp.region) === '11318' &&
      same(wordstat.seeds, OMSK_CASES[code].seeds) &&
      same(serp.queries.map(row => row.query), OMSK_CASES[code].queries) &&
      serp.queries.length === 2 && Number(serp.groupsOnPage) === 5,
      'Cached Omsk source does not match the expected regional research.');
  } else {
    const queries = serp.queries.filter(row => RELEVANT.test(row.query));
    const results = queries.reduce((n, q) => n + q.results.length, 0);
    check(queries.length >= 5 && results >= 50,
      'Insufficient topic-relevant source evidence (need >=5 queries and >=50 SERP snippets); Jev blocked.');
    selectedSerp = {
      ...serp, queries, source: 'yandex-search-api-v2',
      filtering: { rule: 'explicit-topic-query-match',
        note: 'Exclude Wordstat suggested queries about personal name Lida and unrelated topics before Jev.',
        excludedQueries: serp.queries.length - queries.length },
    };
  }
  const profile = parse(await read(path.join(repository, PROFILE)), PROFILE);
  const codeHashes = {};
  for (const filename of HASHED_FILES) {
    codeHashes[filename] = hash(await fs.readFile(path.join(repository, filename)));
  }
  const sourceHashes = Object.fromEntries(evidenceFiles.map(name => [name, hash(texts[name])]));
  const model = String(env.YAAI_JEV_MODEL || 'typesafe/jev-1.13');
  const fingerprint = hash(JSON.stringify({
    version: 1, config: cfg, sourceHashes, model, codeHashes,
  }));
  return { cfg, sourceRoot: root, source: data, selectedSerp, profile, model, fingerprint };
}

export async function inspectCachedStudy(directory, context) {
  const root = path.resolve(directory), { cfg, fingerprint, selectedSerp, source } = context;
  check(root !== context.sourceRoot && !root.startsWith(context.sourceRoot + path.sep) &&
    !context.sourceRoot.startsWith(root + path.sep),
  'Research source and saved output directories must be separate.');
  const manifestRaw = await maybeRead(path.join(root, 'cached-jev-resume-manifest.json'));
  const present = [];
  for (const stage of cfg.stages) {
    const contents = await Promise.all(cfg.files[stage].map(name => maybeRead(path.join(root, name))));
    if (contents.some(x => x !== null) && contents.some(x => x === null)) {
      throw Error('Incomplete saved ' + stage + ' output; inspect artifacts before retrying (no paid calls).');
    }
    if (contents.every(x => x !== null)) present.push(stage);
  }
  let checkpoints = [];
  try { checkpoints = await fs.readdir(path.join(root, 'pain-map.json.jev-checkpoints')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (manifestRaw === null && (present.length || checkpoints.length)) {
    throw Error('Legacy/unverified Jev artifacts lack the cached-study manifest. Refusing recovery.');
  }
  if (manifestRaw !== null) {
    const manifest = parse(manifestRaw, 'cached-jev-resume-manifest.json');
    check(manifest.version === 1 && manifest.mode === cfg.mode &&
      manifest.code === cfg.code && manifest.fingerprint === fingerprint,
      'Incompatible cached-study manifest: source, case, model or research code changed.');
  }
  let gap = false;
  for (const stage of cfg.stages) {
    if (!present.includes(stage)) gap = true;
    else if (gap) throw Error('Invalid stage order; cannot reuse later output before unfinished stage.');
  }
  const parsed = async name => parse(await read(path.join(root, name)), name);
  if (present.includes('filter')) {
    const filtered = await parsed('serp.json');
    check(same(filtered, selectedSerp), 'Saved relevance filter does not match the source evidence.');
  }
  if (present.includes('jev')) {
    const map = await parsed('pain-map.json');
    const evals = await parsed('jev-evidence.json');
    const input = context.cfg.mode === 'omsk' ? source['serp.json'] : selectedSerp;
    check(map.source === 'yaai-pain-discovery' && map.topic === cfg.topic &&
      map.input?.serpGeneratedAt === (input.generatedAt || null) &&
      map.input?.wordstatGeneratedAt === (source['wordstat.json']?.generatedAt || null) &&
      Array.isArray(map.evidenceLedger) &&
      evals.schemaVersion === 1 && evals.profile?.id === context.profile.id &&
      Array.isArray(evals.evaluations) && evals.evaluations.length <= cfg.limit &&
      evals.evaluations.length === map.input?.classifiedCount &&
      map.evidenceLedger.length === evals.evaluations.length,
      'Saved Jev assessment is inconsistent with the source, profile or decision count.');
  }
  if (present.includes('review')) {
    const queue = await parsed('review-unlabeled.json');
    check(Array.isArray(queue.items) && queue.items.length <= cfg.reviewSize &&
      queue.items.length >= cfg.minReviewSize &&
      queue.items.every(row => row.label?.isPain == null),
      'Saved blind review has invalid/unlabeled population or contains human labels.');
    if (cfg.mode === 'relevance') {
      check(queue.items.every(row => RELEVANT.test(row.evidence?.query || '')),
        'Saved review includes off-topic search evidence.');
      const map = await parsed('pain-map.json');
      check(map.evidenceLedger.length >= 50,
        'Relevance population has fewer than 50 saved source observations.');
    }
  }
  if (present.includes('quality')) {
    const qualityFile = cfg.files.quality[0];
    const quality = await parsed(qualityFile);
    check(typeof quality.status === 'string' && quality.status.length > 0,
      'Saved Pain Quality result is invalid.');
  }
  return {
    root, cfg, completed: present,
    pending: cfg.stages.filter(stage => !present.includes(stage)),
    paidPending: !present.includes('jev'),
    checkpoints: checkpoints.length,
    hasManifest: manifestRaw !== null,
  };
}

export async function runCachedStudy({
  mode, code = null, source, output, execute = false,
  repository = REPO, env = process.env, invoke,
} = {}) {
  check(source && output, 'Both --source and --dir are required.');
  check(typeof invoke === 'function', 'Missing stage runner.');
  const context = await inspectSource({ mode, code, source, repository, env });
  let state = await inspectCachedStudy(output, context);
  if (!execute && state.paidPending) {
    throw Error('PAID CALLS BLOCKED. Jev stage unfinished; explicitly enable confirm_paid_requests=true.');
  }
  if (!state.hasManifest) {
    await saveExclusive(path.join(state.root, 'cached-jev-resume-manifest.json'), {
      version: 1, mode: context.cfg.mode, code: context.cfg.code,
      fingerprint: context.fingerprint,
    });
  }
  for (const stage of context.cfg.stages) {
    if (state.completed.includes(stage)) continue;
    await invoke(stage, state.root, context);
    state = await inspectCachedStudy(output, context);
    check(state.completed.includes(stage), 'Stage did not complete: ' + stage);
  }
  return state;
}

async function actualStage(stage, root, context) {
  const { cfg, sourceRoot, selectedSerp } = context;
  const local = file => path.join(root, file);
  if (stage === 'filter') {
    await saveExclusive(local('serp.json'), selectedSerp);
    return;
  }
  const command = {
    jev: ['scripts/pain-analyze.mjs', '--topic', cfg.topic,
      ...(cfg.mode === 'omsk' ? ['--wordstat', path.join(sourceRoot, 'wordstat.json')] : []),
      '--serp', cfg.mode === 'relevance' ? local('serp.json') : path.join(sourceRoot, 'serp.json'),
      '--limit', String(cfg.limit), '--out', local('pain-map.json'),
      '--md', local('pain-map.md'), '--evaluation-out', local('jev-evidence.json'), '--execute'],
    review: ['scripts/pain-review.mjs', '--map', local('pain-map.json'),
      '--sample-size', String(cfg.reviewSize), '--out', local('review-unlabeled.json')],
    quality: ['scripts/pain-quality.mjs', '--map', local('pain-map.json'),
      '--review', local('review-unlabeled.json'), '--target-labels', String(cfg.targetLabels),
      '--out', local(cfg.files.quality[0]),
      ...(cfg.mode === 'relevance' ? ['--md', local('quality-unlabeled.md')] : [])],
  }[stage];
  check(command, 'Unknown stage: ' + stage);
  console.error('Cached Jev pilot '+cfg.mode+'/'+(cfg.code || '-')+': '+stage+
    (stage === 'jev' ? ' [paid API authorized]' : ' [offline]'));
  const result = spawnSync(process.execPath, command, {
    cwd: REPO, env: process.env, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  check(result.status === 0, 'Stage failed: ' + stage + ' (exit ' + result.status + ').');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = name => {
    const idx = args.indexOf(name);
    return idx === -1 ? null : args[idx+1];
  };
  runCachedStudy({
    mode: flag('--mode'), code: flag('--case'), source: flag('--source'),
    output: flag('--dir'), execute: args.includes('--execute'),
    invoke: actualStage,
  }).then(result => console.log(JSON.stringify({
    scenario: result.cfg.mode, case: result.cfg.code,
    completed: result.completed, pending: result.pending,
    savedCheckpoints: result.checkpoints,
  }, null, 2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
