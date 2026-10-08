import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  PILOT_SETTINGS, PAID_PILOT_STAGES, pilotFingerprint, inspectPilot,
  runPilot,
} from './pain-pilot-resume.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-pain-pilot-resume-'));
const cache = path.join(dir, 'work');

const fixture = async (stage, root) => {
  await fs.mkdir(root, { recursive: true });
  const save = (name, payload) => fs.writeFile(path.join(root, name), JSON.stringify(payload) + '\n');
  switch (stage) {
    case 'wordstat':
      await save('wordstat.json', {
        schemaVersion: 1, source: 'yandex-wordstat-topRequests', generatedAt: '2026-10-01T00:00:00Z',
        seeds: PILOT_SETTINGS.seeds, regions: [{ id: PILOT_SETTINGS.region }],
        calls: PILOT_SETTINGS.seeds.map(seed => ({ seed })), rows: [],
      });
      break;
    case 'queries':
      await save('query-plan.json', {
        schemaVersion: 1, source: 'yaai-pain-query-plan', topic: PILOT_SETTINGS.topic,
        queries: [{ query: 'обработка заявок проблемы' }],
      });
      await fs.writeFile(path.join(root, 'serp-queries.txt'), 'обработка заявок проблемы\n');
      break;
    case 'serp':
      await save('serp.json', {
        schemaVersion: 1, source: 'yandex-search-api-v2', generatedAt: '2026-10-02T00:00:00Z',
        region: PILOT_SETTINGS.region, groupsOnPage: PILOT_SETTINGS.groups,
        queries: [{ query: 'обработка заявок проблемы', results: [] }],
      });
      break;
    case 'jev':
      await save('pain-map.json', {
        source: 'yaai-pain-discovery', topic: PILOT_SETTINGS.topic,
        input: { wordstatGeneratedAt: '2026-10-01T00:00:00Z',
          serpGeneratedAt: '2026-10-02T00:00:00Z', classifiedCount: 0 },
        evidenceLedger: [],
      });
      await fs.writeFile(path.join(root, 'pain-map.md'), '# Synthetic fixture\n');
      await save('jev-evidence.json', {
        schemaVersion: 1, profile: { id: 'pain-discovery' }, evaluations: [],
      });
      break;
    case 'review':
      await save('review-unlabeled.json', { items: [] });
      break;
    case 'quality':
      await save('quality-unlabeled.json', { status: 'awaiting_labels' });
      await fs.writeFile(path.join(root, 'quality-unlabeled.md'), '# Synthetic fixture\n');
      break;
    default: throw new Error('Unexpected stage: ' + stage);
  }
};

try {
  let invoked = 0;
  const record = async (stage, root) => { invoked++; await fixture(stage, root); };
  await assert.rejects(runPilot({ directory: cache, execute: false, invoke: record }), /PAID CALLS BLOCKED/);
  assert.equal(invoked, 0);
  const steps = [];
  const good = await runPilot({
    directory: cache, execute: true,
    invoke: async (stage, root) => { steps.push(stage); await fixture(stage, root); },
  });
  assert.deepEqual(steps, ['wordstat', 'queries', 'serp', 'jev', 'review', 'quality']);
  assert.equal(good.pending.length, 0);
  await runPilot({ directory: cache, execute: false, invoke: () => {
    throw new Error('No saved stage should rerun');
  } });

  // New run recovers cached Yandex evidence, but Jev must be explicitly approved.
  const partial = path.join(dir, 'partial');
  await fs.mkdir(partial);
  await fs.copyFile(path.join(cache, 'resume-manifest.json'), path.join(partial, 'resume-manifest.json'));
  for (const name of ['wordstat.json', 'query-plan.json', 'serp-queries.txt', 'serp.json']) {
    await fs.copyFile(path.join(cache, name), path.join(partial, name));
  }
  await fs.mkdir(path.join(partial, 'pain-map.json.jev-checkpoints'));
  await fs.writeFile(path.join(partial, 'pain-map.json.jev-checkpoints', 'fixture.json'), '{}');
  const sig = await pilotFingerprint();
  const interrupted = await inspectPilot(partial, sig);
  assert.deepEqual(interrupted.pendingPaid, ['jev']);
  assert.equal(interrupted.checkpointExists, true);
  const executed = [];
  await assert.rejects(runPilot({
    directory: partial, execute: false,
    invoke: () => { throw new Error('No new paid calls'); },
  }), /PAID CALLS BLOCKED/);
  const resumed = await runPilot({
    directory: partial, execute: true,
    invoke: async (stage, root) => { executed.push(stage); await fixture(stage, root); },
  });
  assert.deepEqual(executed, ['jev', 'review', 'quality']);
  assert.deepEqual(resumed.pending, []);
  assert.equal(PAID_PILOT_STAGES.length, 3);

  const corrupted = path.join(dir, 'corrupted');
  await fs.mkdir(corrupted);
  await fs.copyFile(path.join(cache, 'resume-manifest.json'), path.join(corrupted, 'resume-manifest.json'));
  await fs.copyFile(path.join(cache, 'wordstat.json'), path.join(corrupted, 'wordstat.json'));
  const json = JSON.parse(await fs.readFile(path.join(corrupted, 'wordstat.json')));
  json.seeds = ['wrong topic'];
  await fs.writeFile(path.join(corrupted, 'wordstat.json'), JSON.stringify(json));
  await assert.rejects(runPilot({
    directory: corrupted, execute: true, invoke: () => { throw new Error('No paid call'); },
  }), /does not match/);

  const unverified = path.join(dir, 'unverified');
  await fs.mkdir(unverified);
  await fs.copyFile(path.join(cache, 'wordstat.json'), path.join(unverified, 'wordstat.json'));
  await assert.rejects(runPilot({
    directory: unverified, execute: true, invoke: () => { throw new Error('No paid call'); },
  }), /lacks resume-manifest/);

  const incomplete = path.join(dir, 'incomplete');
  await fs.mkdir(incomplete);
  await fs.copyFile(path.join(cache, 'resume-manifest.json'), path.join(incomplete, 'resume-manifest.json'));
  for (const name of ['wordstat.json', 'query-plan.json', 'serp-queries.txt', 'serp.json', 'pain-map.json']) {
    await fs.copyFile(path.join(cache, name), path.join(incomplete, name));
  }
  await assert.rejects(runPilot({
    directory: incomplete, execute: true, invoke: () => { throw new Error('No paid call'); },
  }), /Incomplete saved stage/);

  const fingerprintMismatch = await pilotFingerprint('examples/evaluation-profiles/lead-qualification.json');
  await assert.rejects(inspectPilot(cache, fingerprintMismatch), /Incompatible research manifest/);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}

console.log('Pain pilot recovery selftest: ok (offline, no Yandex/OpenRouter calls)');
