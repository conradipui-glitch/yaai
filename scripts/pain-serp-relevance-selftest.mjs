import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { inspectPainSerpCandidates, assessPainSerpResult } from '../lib/pain-serp-relevance.mjs';
import { buildPainEvidenceItems, buildPainMap } from '../lib/pain-discovery.mjs';
import { buildPainReportDocument } from '../lib/evidence-report.mjs';
import { renderPainReportHtml } from '../lib/evidence-report-html.mjs';

const topic='обработка заявок';
const entry=(url,title,passage)=>({position:1,url,title,passage});
const serp={
  generatedAt:'2026-10-09T01:00:00Z',region:'225',
  queries:[
    {query:'обработка заявок проблемы',results:[
      entry('https://example.test/birthday','С днем рождения, дорогая Лида','Поздравления, открытки и подарки для Лиды'),
      entry('https://example.test/road','Ремонт железной дороги','Железные дороги и асфальтирование дорог'),
      entry('https://example.test/experimental','Необычная практика','Новые методики, пока без привычной терминологии'),
      entry('https://example.test/real','Проблемы обработки заявок','Клиенты долго ждут ответа, заявки пропадают'),
      entry('https://example.test/seller','Обработка заявок — купить CRM','Наш продукт самый лучший, оставьте заявку'),
      entry('https://example.test/mixed','С днем рождения Лида','Разбор такого примера в воронке продаж: маркетинг, клиенты и заявки'),
      entry('https://example.test/surname','Петр Лидов — биография','Архив писателя и его жизнь'),
      entry('https://example.test/duplicates','Обработка заявок: проблемы','В этой системе теряются заявки'),
      entry('https://example.test/duplicates','Обработка заявок: проблемы','В этой системе теряются заявки'),
    ]},
    {query:'дорогой лиде',results:[
      entry('https://example.test/offtopic-query','Анализ поведения клиентов','Этот результат сам по себе может быть бизнесовым, но запрос не о бизнесе'),
    ]},
  ],
};
const input=structuredClone(serp);
const results=inspectPainSerpCandidates({topic,serp});
assert.equal(results.audit.examined,9,'deduplicated valid SERP rows are audited once');
assert.equal(results.audit.excludedCount,3);
assert.equal(results.audit.retained,6);
assert.equal(results.audit.reviewCount,2,'novel and unexpected-query snippets stay flagged');
assert.equal(results.retained.find(x=>x.url.includes('experimental')).relevanceDecision,'review');
assert.deepEqual(serp,input,'saved paid source never mutates');
assert.ok(results.audit.excluded.some(x=>x.reason==='personal-name-greeting-result'));
assert.ok(results.audit.excluded.some(x=>x.reason==='literal-road-result'));
assert.ok(results.audit.excluded.some(x=>x.reason==='person-surname-result'));
assert.ok(results.retained.some(x=>x.url.endsWith('offtopic-query') && x.relevanceReason==='off-topic-query-on-topic-excerpt'));

// Actual failure mode: Yandex interprets an off-topic query "дорогой лиде"
 // as marketing "дорогие лиды". The page itself must survive.
 const leadCost = assessPainSerpResult({
   topic, query:'дорогой лиде',
   title:'Дорогие лиды из рекламы — почему и что делать',
   passage:'Стоимость привлечения клиента, цена заявки, реклама, CPL',
 });
 assert.equal(leadCost.decision,'review');
 assert.equal(leadCost.reason,'off-topic-query-on-topic-excerpt');
 const innocent = assessPainSerpResult({
   topic, query:'с днем рождения дорогая лида',
   title:'С днем рождения, Лида!', passage:'Поздравления и открытки Лиде',
 });
 assert.equal(innocent.decision,'exclude');

const tiny=buildPainEvidenceItems({topic,serp,limit:2});
assert.equal(tiny.length,2);
assert.equal(tiny[0].evidence.url,'https://example.test/experimental');
assert.equal(tiny[1].evidence.url,'https://example.test/offtopic-query');
assert.equal(tiny[1].evidence.sourceRelevance.decision,'review');
assert.equal(tiny[0].evidence.sourceRelevance.decision,'review');
const whole=buildPainEvidenceItems({topic,serp,limit:40});
assert.equal(whole.length,6);
assert.ok(whole.every(item=>!['https://example.test/birthday',
  'https://example.test/road','https://example.test/surname'].includes(item.evidence.url)));
assert.ok(whole.some(item=>item.evidence.url==='https://example.test/seller'),
  'commercial sources remain as useful negatives for Jev and recall QA');
assert.ok(whole.some(item=>item.evidence.url==='https://example.test/mixed'),
  'mixed marketing page quoting a name must not be silently excluded');

// Domain-specific rules don't erase unrelated legitimate research, including
// personal-name subjects or unfamiliar terms in construction/technology.
assert.notEqual(assessPainSerpResult({
  topic:'подарки для Лиды',query:'с днем рождения лида',
  title:'С днем рождения Лида',passage:'Красивые поздравления Лиде',
}).decision,'exclude');
assert.notEqual(assessPainSerpResult({
  topic:'ремонт дорог',query:'дороги',
  title:'Ремонт железной дороги',passage:'Работы и материалы на железной дороге',
}).decision,'exclude');
assert.equal(assessPainSerpResult({
  topic:'фасадные работы',query:'фасадные технологии',
  title:'Новый способ',passage:'Редкий эксперимент с новым составом',
}).decision,'review');
assert.equal(inspectPainSerpCandidates({topic,serp:null}).audit,null);

const evaluations={
  summary:{totalCost:0.00005,measuredCostSubtotal:0.00005,missingCostCount:0},
  evaluations:whole.map(item=>({
    itemId:item.id,
    answers:{
      pain_present:{value:item.evidence.url.includes('real') ? 0.9 : 0.1},
      pain_type:{value:item.evidence.url.includes('real') ? 'time_loss' : 'none'},
      voice:{value:'third_party'},
    },
    route:{needsReview:true},usage:{cost:0.00001},
  })),
};
const map=buildPainMap({topic,evidenceItems:whole,evaluations,serp});
assert.equal(map.input.evidenceItemCount,6);
assert.equal(map.serpSourceSelection.excludedCount,3);
assert.equal(map.serpSourceSelection.reviewCount,2);
assert.equal(map.summary.rejectedEvidence,5,'only Jev-assessed rows count as negatives');
const report=buildPainReportDocument(map);
assert.equal(report.serpSourceSelection.excludedCount,3);
assert.equal(report.observations.find(x=>x.url.endsWith('experimental')).sourceRelevance.decision,'review');
assert.equal(report.observations.length,6);

const [css,script]=await Promise.all([
  fs.readFile('public/evidence-report.css','utf8'),
  fs.readFile('public/evidence-report.js','utf8'),
]);
const html=renderPainReportHtml(report,{css,script});
assert.match(html,/3 исключено из 9 фрагментов выдачи/);
assert.match(html,/неоднозначных фрагментов сохранено на проверку/);
assert.match(html,/Источник требует проверки соответствия теме/);
assert.match(html,/Показать исключённые страницы и причины/);
assert.match(html,/Показать 2 неоднозначных источников/);
assert.match(html,/example\.test\/birthday/);
assert.match(html,/example\.test\/experimental/);

const broken=structuredClone(map);
broken.serpSourceSelection.excludedCount++;
assert.throws(()=>buildPainReportDocument(broken),/SERP relevance audit counters are invalid/);
const forged=structuredClone(map);
forged.serpSourceSelection.excluded[0].url=whole[0].evidence.url;
forged.serpSourceSelection.excluded[0].excerpt=whole[0].evidence.excerpt;
assert.throws(()=>buildPainReportDocument(forged),/excluded SERP result entered Jev evidence/);
const malicious=structuredClone(map);
malicious.serpSourceSelection.excluded[0].title='<img src=x onerror=alert(1)>';
const escaped=renderPainReportHtml(buildPainReportDocument(malicious),{css,script});
assert.match(escaped,/&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(escaped,/<img src=x onerror=alert\(1\)>/);
console.log('Pain SERP relevance selftest: ok (source exclusions, ambiguous retention, audit integrity, offline HTML; zero paid API)');
