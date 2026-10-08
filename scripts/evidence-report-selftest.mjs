import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPainEvidenceItems, buildPainMap } from '../lib/pain-discovery.mjs';
import { preparePainReview, evaluatePainQuality } from '../lib/pain-quality.mjs';
import { buildPainReportDocument } from '../lib/evidence-report.mjs';
import { renderPainReportHtml } from '../lib/evidence-report-html.mjs';

const malicious = '</script><img src=x onerror="alert(1)">';
const wordstat = {generatedAt:'2026-10-09T01:00:00Z',rows:[
  {phrase:'теряются заявки клиентов',count:129,regionName:'Омск',types:['top']},
  {phrase:'дорогие заявки стоимость',count:null,regionName:'Омск',types:['top']},
]};
const serp = {generatedAt:'2026-10-09T01:30:00Z',region:'11318',queries:[
  {query:'потеря заявок',results:[
    {position:1,url:'https://source.example/forum',title:'Жалоба',passage:'Наши заявки теряются. ' + malicious},
    {position:2,url:'https://vendor.example/pr',title:'Продажи',passage:'Купите наш продукт, он решает все проблемы.'},
  ]},
]};
const items = buildPainEvidenceItems({topic:'обработка заявок',wordstat,serp,limit:10});
assert.equal(items.length,4);
const evaluations = {
  summary:{totalCost:null,measuredCostSubtotal:0.00003,missingCostCount:1},
  evaluations:items.map((item,i)=>({
    itemId:item.id,
    answers:{
      pain_present:{value:i===3?0.15:0.94},
      pain_type:{value:i===1?'high_cost':i===3?'none':'lost_opportunities',certainty:0.91},
      voice:{value:i===2?'first_person':'question'},
      solution_intent:{value:0.2},
    },
    route:{needsReview:i===0},
    usage:{cost:i===2?null:0.00001},
  })),
};
const map = buildPainMap({topic:'обработка заявок',evidenceItems:items,evaluations,wordstat,serp});
const report = buildPainReportDocument(map);
assert.equal(report.source,'yaai-evidence-report');
assert.equal(report.schemaVersion,1);
assert.equal(report.summary.assessedObservations,4);
assert.equal(report.summary.modelAccepted,3);
assert.equal(report.summary.modelRejected,1);
assert.equal(report.summary.modelReviewNeeded,1);
assert.equal(report.claims.length,2);
assert.equal(report.observations.length,4);
assert.equal(report.quality,null);
assert.equal(report.summary.jevCostUsd,null);
assert.equal(report.summary.sourceBreakdown.serp,2);
assert.equal(report.observations.find(x=>x.query.includes('дорогие')).observedCount,null);
assert.ok(report.claims.every(c=>c.status==='hypothesis_requires_validation'));
const known = new Set(report.observations.map(x=>x.id));
assert.ok(report.claims.every(c=>c.evidenceIds.every(id=>known.has(id))));
assert.equal(report.observations.filter(r=>!r.accepted).length,1);
const root=path.resolve('.');
const [css,js]=await Promise.all([
  fs.readFile('public/evidence-report.css','utf8'),
  fs.readFile('public/evidence-report.js','utf8'),
]);
const html=renderPainReportHtml(report,{css,script:js});
assert.match(html,/<!doctype html>/i);
assert.match(html,/lang="ru"/);
assert.match(html,/type="search"/);
assert.match(html,/id="export"/);
assert.match(html,/Сигнал ≠ доказанная боль/);
assert.match(html,/Не принято моделью/);
assert.match(html,/class="claims"/);
assert.match(html,/нет данных/);
assert.match(html,/&lt;\/script&gt;&lt;img/);
assert.doesNotMatch(html, /<img src=x onerror/);
assert.match(html,/https:\/\/source\.example\/forum/);
assert.match(html,/\.table-wrap/);
assert.match(html,/@media print/);
assert.match(html,/@media\(max-width:680px\)/);
assert.match(html,/prefers-reduced-motion/);
assert.match(html,/aria-live="polite"/);
assert.doesNotMatch(html,/<link[^>]*rel="stylesheet"/);

const reviewed = preparePainReview(map,{sampleSize:4});
const quality = evaluatePainQuality(map,reviewed,{targetLabels:4});
assert.equal(quality.status,'insufficient_manual_labels');
const withQuality = buildPainReportDocument(map,{quality});
assert.equal(withQuality.quality.status,'insufficient_manual_labels');
assert.equal(withQuality.quality.metrics,null);
assert.match(renderPainReportHtml(withQuality,{css,script:js}),/Недостаточно разметки/);
const mismatched={...quality,mapFingerprint:'bad'};
assert.throws(()=>buildPainReportDocument(map,{quality:mismatched}),/human-quality report belongs/);
const tampered=structuredClone(map);
tampered.summary.acceptedEvidence++;
assert.throws(()=>buildPainReportDocument(tampered),/summary disagrees/);
const mislabeled=structuredClone(map);
mislabeled.cards[0].searchPhraseCount++;
assert.throws(()=>buildPainReportDocument(mislabeled),/card counts/);
const missingSource=structuredClone(map);
missingSource.cards[0].evidence.wordstat.push({id:'missing'});
assert.throws(()=>buildPainReportDocument(missingSource),/outside its category/);
const duplicate=structuredClone(map);
duplicate.evidenceLedger[1].id=duplicate.evidenceLedger[0].id;
assert.throws(()=>buildPainReportDocument(duplicate),/unique ID/);
const brokenUrl=structuredClone(map);
const snippet=brokenUrl.evidenceLedger.find(x=>x.kind==='serp_snippet');
snippet.url='javascript:alert(1)';
assert.throws(()=>buildPainReportDocument(brokenUrl),/source URL is not valid/);

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-report-'));
try {
  const src=path.join(dir,'pain-map.json');
  const qualitySrc=path.join(dir,'quality.json');
  const target=path.join(dir,'report.html');
  await fs.writeFile(src,JSON.stringify(map));
  await fs.writeFile(qualitySrc,JSON.stringify(quality));
  const command=['scripts/render-pain-report.mjs','--map',src,'--html',target,'--quality',qualitySrc];
  const good=spawnSync(process.execPath,command,{
    cwd:root,encoding:'utf8',env:{...process.env,YAIS_AI:'',OPENROUTER_API_KEY:''},
  });
  assert.equal(good.status,0,good.stderr);
  assert.match(good.stdout,/"paidApiCalls": 0/);
  const resultJson=JSON.parse(await fs.readFile(path.join(dir,'report.json'),'utf8'));
  assert.equal(resultJson.claims.length,2);
  assert.equal(resultJson.quality.status,'insufficient_manual_labels');
  assert.match(await fs.readFile(target,'utf8'),/YA AI/);
  const duplicateCall=spawnSync(process.execPath,command,{cwd:root,encoding:'utf8'});
  assert.notEqual(duplicateCall.status,0);
  assert.match(duplicateCall.stderr,/Report output already exists/);
  const brokenInput=path.join(dir,'broken.json');
  await fs.writeFile(brokenInput,JSON.stringify(tampered));
  const refused=spawnSync(process.execPath,[
    'scripts/render-pain-report.mjs','--map',brokenInput,'--html',path.join(dir,'bad.html'),
  ],{cwd:root,encoding:'utf8'});
  assert.notEqual(refused.status,0);
  assert.match(refused.stderr,/Report integrity/);
  await assert.rejects(fs.stat(path.join(dir,'bad.html')),{code:'ENOENT'});
} finally { await fs.rm(dir,{recursive:true,force:true}); }
console.log('Evidence Report selftest: ok (source integrity, rejected model evidence, quality gating, HTML escaping, offline CLI)');
