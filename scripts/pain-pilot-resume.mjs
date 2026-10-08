import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PILOT_STAGES = ['wordstat', 'queries', 'serp', 'jev', 'review', 'quality'];
export const PAID_PILOT_STAGES = ['wordstat', 'serp', 'jev'];
export const PILOT_SETTINGS = {
  scenario: 'pain-quality-pilot-v1',
  topic: 'обработка заявок',
  seeds: ['обработка заявок', 'лиды теряются', 'дорогие лиды'],
  region: '225',
  phrases: 90,
  queryLimit: 12,
  groups: 12,
  jevLimit: 90,
  reviewSize: 80,
  targetLabels: 50,
};

const STAGE_FILES = {
  wordstat: ['wordstat.json'],
  queries: ['query-plan.json', 'serp-queries.txt'],
  serp: ['serp.json'],
  jev: ['pain-map.json', 'pain-map.md', 'jev-evidence.json'],
  review: ['review-unlabeled.json'],
  quality: ['quality-unlabeled.json', 'quality-unlabeled.md'],
};

function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function cleanQueries(text) { return text.split(/\r?\n/).map(q => q.trim()).filter(Boolean); }
function normalizeJson(text, filename) {
  try { return JSON.parse(text); }
  catch { throw new Error('Invalid or incomplete JSON in saved artifact: ' + filename); }
}

export async function pilotFingerprint(profileFile = 'examples/evaluation-profiles/pain-discovery.json', env = process.env) {
  const model = String(env.YAAI_JEV_MODEL || 'typesafe/jev-1.13');
  const profileHash = sha256(await fs.readFile(profileFile));
  return sha256(JSON.stringify({ ...PILOT_SETTINGS, model, profileHash }));
}

export async function inspectPilot(directory, fingerprint) {
  const root = path.resolve(directory);
  const files = {};
  const fileText = async (name) => {
    if (files[name] !== undefined) return files[name];
    try { files[name] = await fs.readFile(path.join(root, name), 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') files[name] = null;
      else throw error;
    }
    return files[name];
  };
  const json = async (name) => normalizeJson(await fileText(name), name);
  const manifestText = await fileText('resume-manifest.json');
  const present = [];
  for (const stage of PILOT_STAGES) {
    const contents = await Promise.all(STAGE_FILES[stage].map(fileText));
    const n = contents.filter(x => x != null).length;
    if (n && n !== contents.length) {
      throw new Error('Incomplete saved stage "' + stage + '". Inspect files before resuming; no paid calls made.');
    }
    if (n) present.push(stage);
  }
  // Incomplete paid stages may still contain paid responses from earlier
  // requests. Preserve them across Actions runs, even if no final JSON exists.
  const checkpointDirectories = [
    'wordstat.json.yandex-checkpoints',
    'serp.json.yandex-checkpoints',
    'pain-map.json.jev-checkpoints',
  ];
  const partialCheckpoints = [];
  for (const name of checkpointDirectories) {
    try {
      const names = await fs.readdir(path.join(root, name));
      if (names.length) partialCheckpoints.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const checkpointExists = partialCheckpoints.length > 0;
  if (!manifestText && (present.length || checkpointExists)) {
    throw new Error('Saved research lacks resume-manifest.json. Do not reuse unverified legacy artifacts.');
  }
  if (manifestText) {
    const manifest = normalizeJson(manifestText, 'resume-manifest.json');
    assert(manifest.version === 1 && manifest.scenario === PILOT_SETTINGS.scenario &&
      manifest.fingerprint === fingerprint, 'Incompatible research manifest (settings/model/profile changed). Start a fresh research directory.');
  }
  const completed = new Set(present);
  // A later finished stage requires every prior stage to be complete.
  let gap = false;
  for (const stage of PILOT_STAGES) {
    if (!completed.has(stage)) gap = true;
    else if (gap) throw new Error('Later stage "' + stage + '" exists while an earlier stage is missing. Inspect artifacts manually.');
  }
  if (completed.has('wordstat')) {
    const w = await json('wordstat.json');
    assert(w.schemaVersion === 1 && w.source === 'yandex-wordstat-topRequests' &&
      equal(w.seeds, PILOT_SETTINGS.seeds) && String(w.regions?.[0]?.id) === PILOT_SETTINGS.region &&
      w.regions.length === 1 && Array.isArray(w.rows) && Array.isArray(w.calls) &&
      w.calls.length === PILOT_SETTINGS.seeds.length,
      'Saved Wordstat evidence does not match this research configuration.');
  }
  if (completed.has('queries')) {
    const p = await json('query-plan.json');
    const q = cleanQueries(await fileText('serp-queries.txt'));
    assert(p.schemaVersion === 1 && p.source === 'yaai-pain-query-plan' &&
      p.topic === PILOT_SETTINGS.topic && Array.isArray(p.queries) &&
      p.queries.length > 0 && p.queries.length <= PILOT_SETTINGS.queryLimit &&
      equal(q, p.queries.map(row => row.query)),
      'Saved SERP query plan is invalid or inconsistent.');
  }
  if (completed.has('serp')) {
    const d = await json('serp.json');
    const q = cleanQueries(await fileText('serp-queries.txt'));
    assert(d.schemaVersion === 1 && d.source === 'yandex-search-api-v2' &&
      String(d.region) === PILOT_SETTINGS.region && Number(d.groupsOnPage) === PILOT_SETTINGS.groups &&
      Array.isArray(d.queries) && d.queries.length === q.length &&
      equal(d.queries.map(row => row.query), q) && d.queries.every(row => Array.isArray(row.results)),
      'Saved SERP evidence does not match the query plan, region or limits.');
  }
  if (completed.has('jev')) {
    const m = await json('pain-map.json');
    const e = await json('jev-evidence.json');
    const wordstat = await json('wordstat.json');
    const serp = await json('serp.json');
    assert(m.source === 'yaai-pain-discovery' && m.topic === PILOT_SETTINGS.topic &&
      Array.isArray(m.evidenceLedger) && m.input?.wordstatGeneratedAt === wordstat.generatedAt &&
      m.input?.serpGeneratedAt === serp.generatedAt &&
      e.schemaVersion === 1 && e.profile?.id && Array.isArray(e.evaluations) &&
      e.evaluations.length <= PILOT_SETTINGS.jevLimit && e.evaluations.length === m.input?.classifiedCount,
      'Saved Jev report is inconsistent with source evidence.');
  }
  if (completed.has('review')) {
    const q = await json('review-unlabeled.json');
    assert(Array.isArray(q.items) && q.items.length <= PILOT_SETTINGS.reviewSize &&
      q.items.every(row => row.label?.isPain == null),
      'Saved blind review has invalid rows or non-empty human labels.');
  }
  if (completed.has('quality')) {
    const q = await json('quality-unlabeled.json');
    assert(q && typeof q === 'object' && q.status,
      'Saved quality report is invalid.');
  }
  return {
    root, completed: [...completed],
    pending: PILOT_STAGES.filter(stage => !completed.has(stage)),
    pendingPaid: PAID_PILOT_STAGES.filter(stage => !completed.has(stage)),
    hasManifest: Boolean(manifestText),
    checkpointExists, partialCheckpoints,
  };
}

export async function initializePilot(directory, fingerprint) {
  const state = await inspectPilot(directory, fingerprint);
  if (!state.hasManifest) {
    await fs.mkdir(state.root, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(state.root, 'resume-manifest.json'),
      JSON.stringify({ version: 1, scenario: PILOT_SETTINGS.scenario, fingerprint }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
  }
  return state;
}

export function assertPaidPermission(state, execute = false) {
  if (!execute && state.pendingPaid.length) {
    throw new Error('PAID CALLS BLOCKED. Missing ' + state.pendingPaid.join(', ') +
      '. Set confirm_paid_requests=true explicitly on manual GitHub Actions launch.');
  }
  return true;
}

export async function runPilot({
  directory = 'pilot', execute = false, profileFile = 'examples/evaluation-profiles/pain-discovery.json',
  env = process.env, invoke,
} = {}) {
  if (typeof invoke !== 'function') throw new Error('runPilot requires an explicit stage runner.');
  const fingerprint = await pilotFingerprint(profileFile, env);
  let state = await inspectPilot(directory, fingerprint);
  assertPaidPermission(state, execute); // BEFORE any stage or paid request.
  state = await initializePilot(directory, fingerprint);
  for (const stage of PILOT_STAGES) {
    if (state.completed.includes(stage)) continue;
    await invoke(stage, state.root);
    const updated = await inspectPilot(directory, fingerprint);
    assert(updated.completed.includes(stage), 'Stage "' + stage + '" finished without a valid saved output.');
    state = updated;
  }
  return state;
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--dir');
  const directory = idx < 0 ? 'pilot' : args[idx + 1];
  const execute = args.includes('--execute');
  const env = process.env;
  const { spawnSync } = await import('node:child_process');
  const invoke = async (stage, root) => {
    const out = p => path.join(root, p);
    const cmd = {
      wordstat: ['scripts/pain-wordstat.mjs', '--seeds', PILOT_SETTINGS.seeds.join(','),
        '--region', PILOT_SETTINGS.region, '--num-phrases', String(PILOT_SETTINGS.phrases),
        '--out', out('wordstat.json'), '--execute'],
      queries: ['scripts/pain-prepare.mjs', '--topic', PILOT_SETTINGS.topic,
        '--wordstat', out('wordstat.json'), '--limit', String(PILOT_SETTINGS.queryLimit),
        '--out', out('query-plan.json'), '--query-file', out('serp-queries.txt')],
      serp: ['scripts/serp-collect.mjs', '--query-file', out('serp-queries.txt'),
        '--region', PILOT_SETTINGS.region, '--groups', String(PILOT_SETTINGS.groups),
        '--out', out('serp.json'), '--execute'],
      jev: ['scripts/pain-analyze.mjs', '--topic', PILOT_SETTINGS.topic,
        '--wordstat', out('wordstat.json'), '--serp', out('serp.json'),
        '--limit', String(PILOT_SETTINGS.jevLimit), '--out', out('pain-map.json'),
        '--md', out('pain-map.md'), '--evaluation-out', out('jev-evidence.json'), '--execute'],
      review: ['scripts/pain-review.mjs', '--map', out('pain-map.json'),
        '--sample-size', String(PILOT_SETTINGS.reviewSize), '--out', out('review-unlabeled.json')],
      quality: ['scripts/pain-quality.mjs', '--map', out('pain-map.json'),
        '--review', out('review-unlabeled.json'), '--target-labels', String(PILOT_SETTINGS.targetLabels),
        '--out', out('quality-unlabeled.json'), '--md', out('quality-unlabeled.md')],
    }[stage];
    if (!cmd) throw new Error('Unknown stage: ' + stage);
    console.log('Running ' + stage + (PAID_PILOT_STAGES.includes(stage) ? ' [paid API authorized]' : ' [offline]'));
    const result = spawnSync(process.execPath, cmd, { stdio: 'inherit', env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Stage failed: ' + stage + ' (exit ' + result.status + ')');
  };
  const state = await runPilot({ directory, execute, env, invoke });
  console.log(JSON.stringify({
    completed: state.completed, remaining: state.pending,
    resumedCheckpoints: state.checkpointExists,
    allResultsSaved: true,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
