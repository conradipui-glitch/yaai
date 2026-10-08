import assert from 'node:assert/strict';
import { makePainQueryPlan, buildPainEvidenceItems, buildPainMap, validateWordstatEvidence } from '../lib/pain-discovery.mjs';
import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import fs from 'node:fs/promises';

const wordstat={
  generatedAt:'2026-10-08T08:00:00Z', rows:[
    {phrase:'как не терять заявки клиентов',count:220,regionName:'Омск',types:['top']},
    {phrase:'дорогие лиды что делать',count:80,regionName:'Омск',types:['top']},
    {phrase:'автоматизация продаж',count:5000,regionName:'Омск',types:['top']},
    {phrase:'долго отвечают клиентам',regionName:'Омск',types:['association']},
  ],
};
const serp={
  generatedAt:'2026-10-08T08:30:00Z',region:'66',
  queries:[
    {query:'не терять заявки',results:[
      {position:1,url:'https://forum.example/post/1',title:'Клиенты уходят',passage:'У нас заявки теряются, уже второй месяц не можем наладить обработку.'},
      {position:2,url:'https://agency.example/landing',title:'CRM улучшает продажи',passage:'Наш продукт решает любые проблемы с заявками. Купите сейчас.'},
    ]}
  ],
};
assert.equal(validateWordstatEvidence(wordstat),wordstat);
assert.throws(()=>validateWordstatEvidence({}),/rows array/);
const plan=makePainQueryPlan({topic:'автоматизация продаж',wordstat,maxQueries:6});
assert.equal(plan.queries.length,6);
assert.equal(plan.queries[0].kind,'observed-wordstat-phrase');
assert.ok(plan.queries.some(q=>q.kind==='generated-search-hypothesis'));
assert.equal(plan.queries.find(q=>q.query==='автоматизация продаж проблемы').count,null);
assert.throws(()=>makePainQueryPlan({topic:'a'}),/3–160/);

const items=buildPainEvidenceItems({topic:'автоматизация продаж',wordstat,serp,limit:20});
assert.equal(items.length,5);
assert.equal(items.filter(x=>x.evidence.kind==='wordstat_phrase').length,3);
assert.equal(items.filter(x=>x.evidence.kind==='serp_snippet').length,2);
const balanced=buildPainEvidenceItems({topic:'автоматизация продаж',wordstat,serp,limit:4});
assert.equal(balanced.filter(x=>x.evidence.kind==='serp_snippet').length,2);
assert.equal(balanced.filter(x=>x.evidence.kind==='wordstat_phrase').length,2);
const one=buildPainEvidenceItems({topic:'автоматизация продаж',wordstat,serp,limit:1});
assert.equal(one[0].evidence.kind,'serp_snippet');
const wordstatOnly=buildPainEvidenceItems({topic:'автоматизация продаж',wordstat,limit:2});
assert.equal(wordstatOnly.length,2);

assert.equal(items.find(x=>x.evidence.query==='долго отвечают клиентам').evidence.observedCount,null);
assert.equal(items.find(x=>x.evidence.query==='как не терять заявки клиентов').evidence.observedCount,220);
assert.throws(()=>buildPainEvidenceItems({topic:'foo'}),/Need Wordstat or SERP/);

const profile=JSON.parse(await fs.readFile('examples/evaluation-profiles/pain-discovery.json','utf8'));
const evaluations=await evaluateItemsWithJev({
  items:items.map(i=>({id:i.id,state:i.state,meta:i.meta})),
  profile,
  callDecision:async ({state})=>{
    const promo=String(state.excerpt).includes('Купите сейчас');
    const cost=String(state.excerpt).includes('дорогие лиды');
    const cat=cost?'high_cost':'lost_opportunities';
    return {
      model:'fake-jev',provider:'test',usage:{cost:0.00001,input_tokens:100,output_tokens:30},
      answers:{
        pain_present:{type:'noul',noul:promo?0.1:0.95},
        pain_type:{type:'choice',choice:promo?'none':cat,confidence:0.95,probabilities:{[cat]:0.95}},
        voice:{type:'choice',choice:promo?'seller_promotion':state.sourceType==='wordstat_phrase'?'question':'first_person',confidence:0.9,probabilities:{}},
        solution_intent:{type:'noul',noul:promo?0.1:0.88},
        urgency:{type:'score',score:2,confidence:0.85,probabilities:{}},
      },
    };
  },
});
const map=buildPainMap({topic:'автоматизация продаж',evidenceItems:items,evaluations,serp,wordstat});
assert.equal(map.summary.acceptedEvidence,4);
assert.equal(map.summary.rejectedEvidence,1);
assert.equal(map.summary.painCategories,2);
assert.equal(map.summary.measuredModelCostUsd,0.00005);
const leads=map.cards.find(c=>c.category==='lost_opportunities');
assert.equal(leads.bestObservedWordstatCount,220);
assert.equal(leads.searchPhraseCount,2);
assert.equal(leads.distinctSearchPages,1);
assert.equal(leads.firsthandSnippetCandidates,1);
assert.equal(leads.evidence.serp[0].url,'https://forum.example/post/1');
assert.equal(leads.status,'hypothesis_requires_validation');
const price=map.cards.find(c=>c.category==='high_cost');
assert.equal(price.bestObservedWordstatCount,80);
assert.ok(map.methodology.some(s=>s.includes('overlap')));
const noCount=buildPainMap({
  topic:'test',evidenceItems:[items[2]],
  evaluations:{evaluations:[{itemId:items[2].id,answers:{
    pain_present:{value:0.99},pain_type:{value:'time_loss'},voice:{value:'question'}},
    route:{needsReview:true}}],summary:{totalCost:0}},
});
assert.equal(noCount.cards[0].bestObservedWordstatCount,null);
console.log('pain discovery selftest: ok');
