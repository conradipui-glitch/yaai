import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CASES, STAGES, PAID_STAGES, runOmskStudy,
  inspectOmskStudy, fingerprintOmskStudy,
} from './omsk-pain-resume.mjs';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-omsk-resume-'));
async function writeJson(root, file, object) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, file), JSON.stringify(object, null, 2) + '\n');
}
async function fakeStage(stage, root, scenario) {
  const id = Object.entries(CASES).find(([, v]) => v === scenario)?.[0] || 'fixture';
  switch(stage) {
    case 'wordstat':
      await writeJson(root, 'wordstat.json', {
        schemaVersion: 1, source: 'yandex-wordstat-topRequests',
        generatedAt: '2026-10-09T00:00:00Z', seeds: scenario.seeds,
        regions: [{ id: '11318' }], calls: scenario.seeds.map(seed => ({ seed })),
        rows: [{ phrase: scenario.topic + ' цена', count: null }],
      });
      break;
    case 'query-plan':
      await writeJson(root, 'query-plan.json', {
        schemaVersion: 1, source: 'yaai-pain-query-plan', topic: scenario.topic,
        queries: [{ query: scenario.topic + ' проблемы' }],
      });
      await fs.writeFile(path.join(root, 'query-plan.txt'), scenario.topic + ' проблемы\n');
      break;
    case 'serp':
      await writeJson(root, 'serp.json', {
        schemaVersion: 1, source: 'yandex-search-api-v2',
        region: '11318', groupsOnPage: 5, generatedAt: '2026-10-09T01:00:00Z',
        queries: scenario.queries.map(query => ({ query, results: [] })),
      });
      break;
    case 'jev':
      await writeJson(root, 'pain-map.json', {
        source: 'yaai-pain-discovery', topic: scenario.topic,
        evidenceLedger: [], input: {
          wordstatGeneratedAt: '2026-10-09T00:00:00Z',
          serpGeneratedAt: '2026-10-09T01:00:00Z',
          classifiedCount: 0,
        },
      });
      await fs.writeFile(path.join(root, 'pain-map.md'), '# fixture for ' + id + '\n');
      await writeJson(root, 'jev-evidence.json', {
        schemaVersion: 1, profile: { id: 'pain-discovery-test' }, evaluations: [],
      });
      break;
    case 'review':
      await writeJson(root, 'review-unlabeled.json', { items: [{ label: { isPain: null } }] });
      break;
    case 'quality':
      await writeJson(root, 'quality.json', { status: 'awaiting_labels' });
      break;
    default: throw Error('Unexpected fake stage: ' + stage);
  }
}

try {
  const root = path.join(tmp, 'roofing');
  let invoked = 0;
  const counted = async () => { invoked++; };
  await assert.rejects(runOmskStudy({
    code: 'roofing', directory: root, execute: false, invoke: counted,
  }), /PAID CALLS BLOCKED/);
  assert.equal(invoked, 0);
  await assert.rejects(runOmskStudy({
    code: 'roofing', directory: root, execute: true,
    invoke: async (stage, dir, scenario) => {
      invoked++;
      if (stage === 'serp') throw Error('synthetic stage outage');
      await fakeStage(stage, dir, scenario);
    },
  }), /synthetic stage outage/);
  assert.equal(invoked, 3); // Wordstat, query plan, interrupted SERP.
  const sig = await fingerprintOmskStudy('roofing');
  const partial = await inspectOmskStudy(root, 'roofing', sig);
  assert.deepEqual(partial.completed, ['wordstat', 'query-plan']);
  assert.deepEqual(partial.pendingPaid, ['serp', 'jev']);
  await assert.rejects(runOmskStudy({
    code: 'roofing', directory: root, execute: false, invoke: counted,
  }), /PAID CALLS BLOCKED/);
  assert.equal(invoked, 3, 'unapproved recovery should not invoke any stage');

  const resumedStages = [];
  const result = await runOmskStudy({
    code: 'roofing', directory: root, execute: true,
    invoke: async (stage, dir, scenario) => {
      resumedStages.push(stage);
      await fakeStage(stage, dir, scenario);
    },
  });
  assert.deepEqual(resumedStages, ['serp', 'jev', 'review', 'quality']);
  assert.deepEqual(result.completed, STAGES);
  assert.equal(result.pending.length, 0);
  assert.equal(PAID_STAGES.length, 3);
  await runOmskStudy({
    code: 'roofing', directory: root, execute: false,
    invoke: () => { throw Error('Completed stages must never be rerun'); },
  });

  // Each matrix case must be isolated: source data from roofing is not screed.
  await assert.rejects(runOmskStudy({
    code: 'screed', directory: root, execute: true, invoke: counted,
  }), /Incompatible Omsk resume manifest/);
  assert.equal(invoked, 3);
  // A model/profile change invalidates the entire saved study.
  const differentModel = await fingerprintOmskStudy('roofing', {
    env: { YAAI_JEV_MODEL: 'provider/other-model' },
  });
  await assert.rejects(inspectOmskStudy(root, 'roofing', differentModel),
    /Incompatible Omsk resume manifest/);

  const failedRestore = path.join(tmp, 'unverified');
  await fs.mkdir(failedRestore);
  await fs.copyFile(path.join(root, 'wordstat.json'), path.join(failedRestore, 'wordstat.json'));
  await assert.rejects(runOmskStudy({
    code: 'roofing', directory: failedRestore, execute: true, invoke: counted,
  }), /lack a verified resume manifest/);
  const incompatible = path.join(tmp, 'incompatible');
  await fs.mkdir(incompatible);
  await fs.copyFile(path.join(root, 'omsk-resume-manifest.json'),
    path.join(incompatible, 'omsk-resume-manifest.json'));
  const badWordstat = JSON.parse(await fs.readFile(path.join(root, 'wordstat.json')));
  badWordstat.seeds[0] = 'wrong paid seed';
  await writeJson(incompatible, 'wordstat.json', badWordstat);
  await assert.rejects(runOmskStudy({
    code: 'roofing', directory: incompatible, execute: true, invoke: counted,
  }), /does not match case, seeds or region/);
  assert.equal(invoked, 3);

  // Partial Jev output cannot safely be overwritten by an automatic retry.
  const incomplete = path.join(tmp, 'incomplete');
  await fs.mkdir(incomplete);
  for (const name of ['omsk-resume-manifest.json','wordstat.json','query-plan.json',
    'query-plan.txt','serp.json','pain-map.json']) {
    await fs.copyFile(path.join(root, name), path.join(incomplete, name));
  }
  await assert.rejects(runOmskStudy({
    code: 'roofing', directory: incomplete, execute: true, invoke: counted,
  }), /Incomplete saved Omsk stage jev/);

  // A saved checkpoint without complete output is a valid *pending* stage,
  // but must still be behind the manual paid-capable authorization.
  const partialWithCheckpoint = path.join(tmp, 'partcheckpoint');
  await fs.mkdir(partialWithCheckpoint);
  for (const name of ['omsk-resume-manifest.json','wordstat.json','query-plan.json',
    'query-plan.txt','serp.json']) {
    await fs.copyFile(path.join(root, name), path.join(partialWithCheckpoint, name));
  }
  const checkpointPath = path.join(partialWithCheckpoint, 'pain-map.json.jev-checkpoints');
  await fs.mkdir(checkpointPath);
  await fs.writeFile(path.join(checkpointPath, 'partial-fixture.json'), '{}');
  const checkpointState = await inspectOmskStudy(partialWithCheckpoint, 'roofing', sig);
  assert.deepEqual(checkpointState.pendingPaid, ['jev']);
  assert.deepEqual(checkpointState.checkpoints, ['pain-map.json.jev-checkpoints']);
  await assert.rejects(runOmskStudy({
    code:'roofing',directory:partialWithCheckpoint,execute:false,invoke:counted,
  }),/PAID CALLS BLOCKED/);

  // The other two cases remain independently valid.
  for (const code of ['screed','facades']) {
    const dirs = path.join(tmp, code);
    const completed = await runOmskStudy({
      code, directory: dirs, execute: true, invoke: fakeStage,
    });
    assert.deepEqual(completed.pending, []);
  }
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log('Omsk Pain multi-case resume selftest: ok (offline, no provider API)');
