import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  configFor, inspectSource, inspectCachedStudy, runCachedStudy,
} from './cached-jev-pilots.mjs';
import { CASES } from './omsk-pain-resume.mjs';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-cached-jev-pilot-'));
async function save(root, name, content) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, name),
    typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
}
const omDate = '2026-10-09T01:00:00.000Z';
const serpDate = '2026-10-09T02:00:00.000Z';

function serp(queries) {
  return {
    schemaVersion: 1, source: 'yandex-search-api-v2',
    region: '11318', groupsOnPage: 5, generatedAt: serpDate,
    queries: queries.map(query => ({
      query,
      results: Array.from({length: 12}, (_, i) => ({
        position: i + 1, url: 'https://example.test/' + i,
        title: 'Synthetic', passage: 'Offline test data only',
      })),
    })),
  };
}

const invoked = [];
async function fakeStage(stage, root, context) {
  invoked.push(stage);
  const cfg = context.cfg;
  if (stage === 'filter') {
    await save(root, 'serp.json', context.selectedSerp);
  } else if (stage === 'jev') {
    const n = cfg.mode === 'relevance' ? 60 : 2;
    const original = cfg.mode === 'relevance' ? context.selectedSerp : context.source['serp.json'];
    const query = original.queries[0].query;
    await save(root, 'pain-map.json', {
      schemaVersion: 1, source: 'yaai-pain-discovery', topic: cfg.topic,
      input: {
        wordstatGeneratedAt: context.source['wordstat.json']?.generatedAt || null,
        serpGeneratedAt: original.generatedAt, classifiedCount: n,
      },
      evidenceLedger: Array.from({length:n}, (_, i)=>({id:'mock-'+i,query,
        evidence: {query}})),
      summary: {acceptedEvidence: 0, measuredModelCostUsd: null},
    });
    await save(root, 'pain-map.md', '# Synthetic offline assessment\n');
    await save(root, 'jev-evidence.json', {
      schemaVersion: 1, profile: {id: context.profile.id},
      evaluations: Array.from({length:n}, (_, i)=>({itemId:'mock-'+i})),
    });
  } else if (stage === 'review') {
    const n = cfg.mode === 'relevance' ? 50 : 2;
    const query = context.selectedSerp.queries[0].query;
    await save(root, 'review-unlabeled.json', {
      items: Array.from({length:n}, (_, i)=>({
        evidenceId:'mock-'+i,evidence: {query}, label: {isPain:null},
      })),
    });
  } else if (stage === 'quality') {
    await save(root, cfg.files.quality[0], {status:'awaiting_human_labels'});
    if (cfg.mode === 'relevance') {
      await save(root, 'quality-unlabeled.md', '# Synthetic no human labels\n');
    }
  } else throw Error('Unsupported mock stage ' + stage);
}

try {
  const omskSource = path.join(tmp, 'omsk-source');
  await save(omskSource, 'wordstat.json', {
    schemaVersion: 1, source: 'yandex-wordstat-topRequests',
    generatedAt: omDate, regions: [{id: '11318'}],
    seeds: CASES.roofing.seeds, rows: [],
  });
  await save(omskSource, 'serp.json', serp(CASES.roofing.queries));
  const report = path.join(tmp, 'omsk-report');
  await assert.rejects(runCachedStudy({
    mode:'omsk',code:'roofing',source:omskSource,output:report,
    execute:false,invoke:fakeStage,
  }), /PAID CALLS BLOCKED/);
  assert.deepEqual(invoked, [], 'Fresh run without permission must not execute stages.');

  await assert.rejects(runCachedStudy({
    mode:'omsk',code:'roofing',source:omskSource,output:report,
    execute:true,invoke:async(stage, root, context)=>{
      if (stage === 'jev') {
        invoked.push('jev interrupted');
        await fs.mkdir(path.join(root, 'pain-map.json.jev-checkpoints'));
        await save(path.join(root, 'pain-map.json.jev-checkpoints'), 'checkpoint-test.json', '{}');
        throw Error('simulated provider interruption');
      }
      await fakeStage(stage, root, context);
    },
  }), /simulated provider interruption/);
  assert.deepEqual(invoked, ['jev interrupted']);
  const beforeResume = await inspectSource({mode:'omsk',code:'roofing',source:omskSource});
  const stopped = await inspectCachedStudy(report, beforeResume);
  assert.equal(stopped.paidPending, true);
  assert.equal(stopped.checkpoints, 1);
  await assert.rejects(runCachedStudy({
    mode:'omsk',code:'roofing',source:omskSource,output:report,
    execute:false,invoke:()=>{ throw Error('Should never run'); },
  }), /PAID CALLS BLOCKED/);

  const resumed = await runCachedStudy({
    mode:'omsk',code:'roofing',source:omskSource,output:report,
    execute:true,invoke:fakeStage,
  });
  assert.deepEqual(resumed.pending, []);
  assert.deepEqual(invoked, ['jev interrupted','jev','review','quality']);
  await runCachedStudy({
    mode:'omsk',code:'roofing',source:omskSource,output:report,
    execute:false,invoke:()=>{ throw Error('Must reuse the complete study'); },
  });

  const wrongCode = await assert.rejects(runCachedStudy({
    mode:'omsk',code:'screed',source:omskSource,output:path.join(tmp,'bad-code'),
    execute:true,invoke:fakeStage,
  }), /Cached Omsk source does not match/);
  assert.equal(wrongCode, undefined);
  const modelAltered = await inspectSource({
    mode:'omsk',code:'roofing',source:omskSource,
    env:{YAAI_JEV_MODEL:'provider/different'},
  });
  await assert.rejects(inspectCachedStudy(report, modelAltered),
    /Incompatible cached-study manifest/);

  const modifiedSources = path.join(tmp,'modified-omsk-source');
  await fs.cp(omskSource, modifiedSources, {recursive:true});
  const data = JSON.parse(await fs.readFile(path.join(modifiedSources,'serp.json')));
  data.queries[0].results[0].passage = 'Altered evidence after initial assessment';
  await save(modifiedSources,'serp.json', data);
  const changed = await inspectSource({
    mode:'omsk',code:'roofing',source:modifiedSources,
  });
  await assert.rejects(inspectCachedStudy(report,changed),
    /Incompatible cached-study manifest/);

  const noManifest = path.join(tmp,'no-manifest');
  await save(noManifest, 'pain-map.json', {source:'unknown'});
  await assert.rejects(inspectCachedStudy(noManifest,beforeResume),
    /Incomplete saved jev output/);
  const checkpointOnly = path.join(tmp,'checkpoint-only');
  await save(path.join(checkpointOnly,'pain-map.json.jev-checkpoints'),
    'mock.json', {});
  await assert.rejects(inspectCachedStudy(checkpointOnly,beforeResume),
    /Legacy\/unverified Jev artifacts/);

  const relevanceSource = path.join(tmp, 'relevance-source');
  const phrases = [
    'обработка заявок проблемы','почему обработка заявок не работает',
    'альтернатива обработка заявок', 'обработка заявок дорого',
    'обработка заявок автоматизация',
    'личное имя лида услуги',
  ];
  const rserp = serp(phrases);
  await save(relevanceSource, 'serp.json', rserp);
  const cleanDir = path.join(tmp, 'clean-relevance');
  const relevant = await inspectSource({mode:'relevance',source:relevanceSource});
  assert.equal(relevant.selectedSerp.queries.length, 5);
  assert.equal(relevant.selectedSerp.filtering.excludedQueries, 1);
  await assert.rejects(runCachedStudy({
    mode:'relevance',source:relevanceSource,output:cleanDir,
    invoke:fakeStage,
  }), /PAID CALLS BLOCKED/);
  const rel = await runCachedStudy({
    mode:'relevance',source:relevanceSource,output:cleanDir,
    execute:true,invoke:fakeStage,
  });
  assert.deepEqual(rel.pending, []);
  assert.deepEqual(invoked.slice(-4), ['filter','jev','review','quality']);
  await runCachedStudy({
    mode:'relevance',source:relevanceSource,output:cleanDir,
    execute:false,invoke:()=>{throw Error('Completed source must not rerun');},
  });
  assert.equal(configFor('relevance').limit,90);
  assert.equal(configFor('omsk','roofing').limit,8);

  // Restored filter must be exactly the one derived from source evidence.
  const filt = JSON.parse(await fs.readFile(path.join(cleanDir,'serp.json')));
  filt.queries[0].query = 'tampered query';
  await save(cleanDir,'serp.json',filt);
  await assert.rejects(inspectCachedStudy(cleanDir,relevant),
    /Saved relevance filter does not match/);

  // Irrelevant evidence must be rejected even with paid consent.
  const wrongSource = path.join(tmp,'wrong-relevance');
  await save(wrongSource,'serp.json',serp(['Лида имя','нет связи']));
  await assert.rejects(runCachedStudy({
    mode:'relevance',source:wrongSource,output:path.join(tmp,'refused'),
    execute:true,invoke:fakeStage,
  }), /Insufficient topic-relevant source evidence/);

  // Empty or malformed manifest is not treated as a fresh study.
  const empty = path.join(tmp,'empty-manifest');
  await save(empty,'cached-jev-resume-manifest.json','');
  await assert.rejects(inspectCachedStudy(empty,beforeResume),
    /Invalid saved JSON/);

  assert.deepEqual(invoked, [
    'jev interrupted','jev','review','quality','filter','jev','review','quality',
  ]);
} finally {
  await fs.rm(tmp, {recursive:true,force:true});
}
console.log('Cached Jev pilots recovery selftest: ok (offline, no API calls)');
