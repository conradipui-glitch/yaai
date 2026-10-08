import assert from 'node:assert/strict';
import { assessPainWordstatPhrase, auditPainWordstatCandidates } from '../lib/pain-relevance.mjs';
import { makePainQueryPlan, buildPainEvidenceItems, buildPainMap } from '../lib/pain-discovery.mjs';
import { buildPainReportDocument } from '../lib/evidence-report.mjs';
import { renderPainReportHtml } from '../lib/evidence-report-html.mjs';
import fs from 'node:fs/promises';

// Synthetic reproductions of word-sense collisions observed in a prior
// Wordstat research batch. These are NOT validated customer complaints.
const noisy = [
  ['дорогой лиде',844],
  ['с днем рождения дорогая лида',111],
  ['старые дороги минская область',99],
  ['гомельское отделение белорусской железной дороги',99],
  ['с днем рождения дорогая тетя лида',8],
  ['дорогая лида с днем рождения открытки',7],
  ['дорогая редакция солдатов петр лидов',5],
];
const topic='обработка заявок';
const source={generatedAt:'2026-10-09T01:00:00Z',
  rows:noisy.map(([phrase,count])=>({phrase,count,regionName:'Омск',types:['top']}))};
const original=structuredClone(source);
const plan=makePainQueryPlan({topic,wordstat:source,maxQueries:12});
assert.equal(plan.relevanceAudit.examined,7);
assert.equal(plan.relevanceAudit.excludedCount,7);
assert.equal(plan.relevanceAudit.retained,0);
assert.equal(plan.observedPhraseCount,0);
assert.equal(plan.queries.length,6);
assert.ok(plan.queries.every(row=>row.kind==='generated-search-hypothesis'));
assert.ok(plan.queries.every(row=>!noisy.some(([phrase])=>row.query===phrase)));
assert.deepEqual(source,original,'Filtering must not edit paid source data');
assert.deepEqual(new Set(plan.relevanceAudit.excluded.map(row=>row.reason)),
  new Set(['person-name-address','person-name-greetings','roads-not-marketing-cost','person-surname']));

// Real buyer-oriented terms should still be discoverable: never exclude merely
// because "дорогие" is similar to "дороги" or because a valid lead is mentioned.
for(const phrase of [
  'дорогие лиды что делать', 'лиды теряются и клиенты уходят',
  'проблемы обработки заявок', 'дорога клиента и потери продаж',
  'почему плохо обрабатываются заявки', 'как не терять лиды',
]) assert.notEqual(assessPainWordstatPhrase({topic,phrase}).decision,'exclude',phrase);
assert.equal(assessPainWordstatPhrase({topic:'ремонт дороги',phrase:'старые дороги минская область'}).decision,'keep');
assert.notEqual(assessPainWordstatPhrase({topic:'подарки для Лиды',phrase:'дорогая Лида с днем рождения'}).decision,'exclude');

// Unknown unrelated-looking text is flagged for review, not silently dropped.
const ambiguous=assessPainWordstatPhrase({topic,phrase:'стоимость организации вручную'});
assert.equal(ambiguous.decision,'review');
const mixed=makePainQueryPlan({topic,wordstat:{rows:[
  ...source.rows,{phrase:'дорогие лиды что делать',count:105},
  {phrase:'почему сложная воронка продаж',count:32},
  {phrase:'стоимость организации вручную',count:8},
]},maxQueries:9});
assert.equal(mixed.relevanceAudit.excludedCount,7);
assert.equal(mixed.relevanceAudit.reviewCount,1);
assert.ok(mixed.queries.some(row=>row.query==='дорогие лиды что делать'));
assert.ok(mixed.queries.some(row=>row.query==='почему сложная воронка продаж'));

const audit=auditPainWordstatCandidates({topic,candidates:source.rows});
assert.equal(audit.excludedCount,7);
assert.equal(audit.ruleset,'wordstat-domain-homonyms-v1');

const serp={generatedAt:'2026-10-09T02:00:00Z',region:'225',queries:[{
  query:'обработка заявок проблемы',results:[{
    position:1,url:'https://example.test/feedback',
    title:'Фиксируем запросы клиентов',passage:'Заявки теряются из-за долгой обработки.',
  }],
}]};
const items=buildPainEvidenceItems({topic,wordstat:source,serp,limit:50});
assert.equal(items.length,1);
assert.equal(items[0].evidence.kind,'serp_snippet');
const ev={
  summary:{totalCost:0.00001,measuredCostSubtotal:0.00001,missingCostCount:0},
  evaluations:[{
    itemId:items[0].id,
    answers:{pain_present:{value:0.9},pain_type:{value:'time_loss'},
      voice:{value:'third_party'},solution_intent:{value:0.1}},
    route:{needsReview:true},usage:{cost:0.00001},
  }],
};
const map=buildPainMap({topic,evidenceItems:items,evaluations:ev,wordstat:source,serp});
assert.equal(map.input.classifiedCount,1);
assert.equal(map.sourceSelection.excludedCount,7);
assert.equal(map.evidenceLedger.filter(x=>x.kind==='wordstat_phrase').length,0);
assert.equal(map.cards.length,1);
const report=buildPainReportDocument(map);
assert.equal(report.sourceSelection.excludedCount,7);
assert.equal(report.sourceSelection.excluded[0].phrase,'дорогой лиде');
assert.equal(report.summary.assessedObservations,1);
const [css,js]=await Promise.all([
  fs.readFile('public/evidence-report.css','utf8'),
  fs.readFile('public/evidence-report.js','utf8'),
]);
const html=renderPainReportHtml(report,{css,script:js});
assert.match(html,/7 исключено из 7 кандидатов Wordstat/);
assert.match(html,/Почему|почему|Дороги, не стоимость лидов/);
assert.match(html,/дорогой лиде/);
assert.match(html,/Исходные данные Wordstat не изменялись/);
assert.ok(!html.includes('оценка качества модели подтверждена'));
const malformed=structuredClone(map);
malformed.sourceSelection.excludedCount=6;
assert.throws(()=>buildPainReportDocument(malformed),/relevance audit counters are invalid/);
const leaked=structuredClone(map);
leaked.sourceSelection.excluded.push({phrase:items[0].evidence.query,reason:'person-name-address'});
leaked.sourceSelection.excludedCount+=1;
leaked.sourceSelection.examined+=1;
// A forged audit about a SERP query cannot prove the rule was applied to
// Wordstat; only verified original source content can establish that fact.
assert.ok(buildPainReportDocument(leaked).sourceSelection);

const malicious=structuredClone(map);
malicious.sourceSelection.excluded[0].phrase='дорогой лиде <img src=x onerror=alert(1)>';
const escaped=renderPainReportHtml(buildPainReportDocument(malicious),{css,script:js});
assert.ok(escaped.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!escaped.includes('<img src=x onerror=alert(1)>'));
console.log('Pain relevance selftest: ok (seven homonym collisions excluded before SERP/Jev; valid leads retained; source audit preserved; no API calls)');
