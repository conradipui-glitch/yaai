import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildReviewPack,scoreReviewPack,parseCsv,csvString } from './serp-relevance-benchmark.mjs';
import { assessPainSerpResult } from '../lib/pain-serp-relevance.mjs';

const topic='обработка заявок';
const result=(index,title,passage)=>({
  position:index,url:'https://fixtures.invalid/doc/'+index,title,passage,
});
const snippets=[
  ...Array.from({length:7},(_,i)=>result(i+1,'С днем рождения, Лида! Поздравления '+i,
    'Открытки Лиде с днем рождения.')),
  ...Array.from({length:7},(_,i)=>result(20+i,'Необычная практика '+i,
    'Редкий экспериментальный метод, новые наблюдения без терминологии.')),
  ...Array.from({length:7},(_,i)=>result(40+i,'Обработка заявок: CRM '+i,
    'Клиенты и менеджеры обрабатывают заявки в CRM.')),
  result(90,'CPL: почему дорогие лиды','Стоимость клиента в рекламе, причина роста CPL'),
];
const serp={queries:[
  {query:'обработка заявок проблемы',results:snippets.slice(0,21)},
  {query:'дорогой лиде',results:snippets.slice(21)},
]};
assert.equal(assessPainSerpResult({
  topic,query:'дорогой лиде',
  title:'CPL: почему дорогие лиды',passage:'Стоимость клиента в рекламе',
}).decision,'review');
assert.equal(assessPainSerpResult({
  topic,query:'с днем рождения лида',title:'Поздравления Лиде',
  passage:'Открытки на день рождения Лиде',
}).decision,'exclude');

const source=structuredClone(serp);
const a=buildReviewPack({topic,serp,size:18});
const b=buildReviewPack({topic,serp,size:18});
assert.deepEqual(a,b,'same SERP input and settings must produce a stable sample');
assert.deepEqual(serp,source,'selection must never mutate raw Yandex data');
assert.equal(a.manifest.sampleCount,18);
assert.equal(a.manifest.population,22);
assert.equal(a.manifest.counts.exclude.sampled,6);
assert.equal(a.manifest.counts.review.sampled,6);
assert.equal(a.manifest.counts.keep.sampled,6);
assert.equal(a.rows.filter(row=>row.gold_relevance||row.gold_useful_signal).length,0,
  'the tool must not manufacture gold labels');
assert.deepEqual(parseCsv(a.csv)[0],[
  'id','decision','query','title','excerpt','url','reason',
  'gold_relevance','gold_useful_signal','reviewer_note',
]);
const blindRows=parseCsv(a.blindCsv);
assert.deepEqual(blindRows[0],[
  'id','query','title','excerpt','url',
  'gold_relevance','gold_useful_signal','reviewer_note',
]);
assert.equal(blindRows[0].includes('decision'),false);
assert.equal(blindRows[0].includes('reason'),false);
const blankBlind=scoreReviewPack({manifest:a.manifest,csv:a.blindCsv});
assert.equal(blankBlind.status,'awaiting_independent_labels');
const blank=scoreReviewPack({manifest:a.manifest,csv:a.csv});
assert.equal(blank.status,'awaiting_independent_labels');
assert.equal(blank.decisiveTotal,0);
assert.equal(blank.groups.exclude.correctExclusionRateAmongLabeled,null);
assert.equal(blank.usefulSignals.excluded,0);

const rows=parseCsv(a.csv),header=rows[0];
const col=name=>header.indexOf(name);
let seenExcluded=0;
for(const row of rows.slice(1)){
  const excluded=row[col('decision')]==='exclude';
  if(excluded)seenExcluded++;
  row[col('gold_relevance')]=excluded&&seenExcluded===1?'relevant':
    excluded?'irrelevant':'relevant';
  row[col('gold_useful_signal')]=excluded&&seenExcluded===1?'yes':'no';
}
const reviewed=csvString(rows);
const blindHeaders=blindRows[0];
const fullHeaders=rows[0];
const blindLabeled=csvString([blindHeaders,...rows.slice(1).map(fullRow=>
  blindHeaders.map(name=>fullRow[fullHeaders.indexOf(name)]))]);
const report=scoreReviewPack({manifest:a.manifest,csv:blindLabeled});
assert.deepEqual(report.groups,scoreReviewPack({manifest:a.manifest,csv:reviewed}).groups);
assert.equal(report.status,'descriptive_sample_complete');
assert.equal(report.groups.exclude.decisiveLabels,6);
assert.equal(report.groups.exclude.relevant,1);
assert.equal(report.groups.exclude.irrelevant,5);
assert.ok(Math.abs(report.groups.exclude.harmfulExclusionRateAmongLabeled-1/6)<1e-10);
assert.ok(Math.abs(report.groups.exclude.correctExclusionRateAmongLabeled-5/6)<1e-10);
assert.equal(report.usefulSignals.excluded,1);
assert.equal(report.usefulSignals.preserved,0);
assert.ok(report.limitations.some(x=>x.includes('not estimates')));

const unknown=structuredClone(rows);
unknown[1][col('id')]='forged-id';
assert.throws(()=>scoreReviewPack({manifest:a.manifest,csv:csvString(unknown)}),/duplicate or unknown/);
const changed=structuredClone(rows);
changed[1][col('decision')]='keep';
assert.throws(()=>scoreReviewPack({manifest:a.manifest,csv:csvString(changed)}),/immutable source field changed/);
const badLabel=structuredClone(rows);
badLabel[1][col('gold_relevance')]='definitely';
assert.throws(()=>scoreReviewPack({manifest:a.manifest,csv:csvString(badLabel)}),/invalid relevance label/);
const formula=csvString([header,['=1+1','exclude','Q','T','E','URL','R','','','']]);
assert.match(formula,/'=1\+1/,'formula text is neutralized for spreadsheet reading');
assert.ok(parseCsv(formula)[1][0].startsWith("'="));

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-serp-benchmark-'));
try{
  const data=path.join(tmp,'serp.json'),prefix=path.join(tmp,'review');
  await fs.writeFile(data,JSON.stringify(serp));
  const prepare=spawnSync(process.execPath,[
    'scripts/serp-relevance-benchmark.mjs','prepare','--serp',data,
    '--topic',topic,'--out',prefix,'--size','18',
  ],{cwd:path.resolve('.'),encoding:'utf8'});
  assert.equal(prepare.status,0,prepare.stderr);
  assert.match(prepare.stdout,/"independentHumanLabels": 0/);
  assert.equal(parseCsv(await fs.readFile(prefix+'.csv','utf8')).length,19);
  assert.equal(parseCsv(await fs.readFile(prefix+'.blind.csv','utf8')).length,19);
  const html=await fs.readFile(prefix+'.review.html','utf8');
  assert.match(html,/id="rows-json"/);
  assert.match(html,/Сохранить ответы в CSV/);
  assert.doesNotMatch(html,/"decision":"exclude"/);

  const completed=path.join(tmp,'human-labeled.csv');
  await fs.writeFile(completed,blindLabeled);
  const score=spawnSync(process.execPath,[
    'scripts/serp-relevance-benchmark.mjs','score',
    '--manifest',prefix+'.manifest.json','--labels',completed,
    '--out',path.join(tmp,'score.json'),
  ],{cwd:path.resolve('.'),encoding:'utf8'});
  assert.equal(score.status,0,score.stderr);
  assert.equal(JSON.parse(await fs.readFile(path.join(tmp,'score.json'))).decisiveTotal,18);
  const refuse=spawnSync(process.execPath,[
    'scripts/serp-relevance-benchmark.mjs','prepare','--serp',data,
    '--topic',topic,'--out',prefix,'--size','18',
  ],{cwd:path.resolve('.'),encoding:'utf8'});
  assert.notEqual(refuse.status,0);
  assert.match(refuse.stderr,/Refusing to overwrite/);
}finally{await fs.rm(tmp,{recursive:true,force:true});}
console.log('SERP independent-review benchmark selftest: ok (balanced strata, blinded gold labels, CSV integrity, sample-only metrics, no paid APIs)');
