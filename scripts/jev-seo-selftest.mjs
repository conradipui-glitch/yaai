import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { SEO_JEV_TASKS, prepareSeoJev, routeSeoJev } from '../lib/jev-seo-workflows.mjs';

const profile=async task=>JSON.parse(await fs.readFile(SEO_JEV_TASKS[task],'utf8'));
const terms={businessOffer:'Автоматизация обработки заявок для малых компаний',terms:[
  {query:'автоматизация обработки заявок цена',id:'term-001',campaign:'search',clicks:12,conversions:2,revenue:4000},
  {query:'кто такой Лидов',campaign:'search',clicks:0},
  {query:'как сделать CRM',campaign:'research'},
]};
const tprofile=await profile('search-term-triage');
const batch=prepareSeoJev({task:'search-term-triage',data:terms,profile:tprofile,limit:2});
assert.equal(batch.source,'yaai-jev-seo-prepared');
assert.equal(batch.chosenCount,2);
assert.equal(batch.inputCandidates,3);
assert.equal(batch.items[0].state.reportedMetrics.conversions,2);
assert.equal(batch.items[1].state.reportedMetrics.conversions,null);
assert.equal(batch.items[0].state.businessOffer,terms.businessOffer);
assert.match(batch.inputFingerprint,/^[0-9a-f]{64}$/);
const unchanged=prepareSeoJev({task:'search-term-triage',data:terms,profile:tprofile,limit:2});
assert.deepEqual(batch.items,unchanged.items);
assert.equal(batch.profileFingerprint,unchanged.profileFingerprint);
assert.throws(()=>prepareSeoJev({task:'search-term-triage',
  data:{terms:[{id:'same',query:'x'},{id:'same',query:'y'}]},
  profile:tprofile}),/duplicate source identity/);
assert.throws(()=>prepareSeoJev({task:'search-term-triage',
  data:{terms:[{query:'x',conversions:-1}]},profile:tprofile}),/invalid nonnegative/);
assert.throws(()=>prepareSeoJev({task:'search-term-triage',data:terms,profile:await profile('landing-page-match')}),/profile do not match/);
assert.throws(()=>prepareSeoJev({task:'search-term-triage',data:{terms:[]},profile:tprofile}),/no eligible candidates/);
assert.throws(()=>prepareSeoJev({task:'search-term-triage',data:terms,profile:tprofile,limit:1001}),/invalid item cap/);

const lp=await profile('landing-page-match');
const matches={matches:[
  {id:'match-01',query:'заказать крышу омск',url:'https://example.test/roof/',
    pageTitle:'Кровельные работы в Омске',pageExcerpt:'Монтаж кровли, расчёт стоимости, фотографии реализованных проектов.',
    adPromise:'Работы под ключ со сметой'},
  {query:'популярная крыша',url:'javascript:alert(1)',pageTitle:'Other',pageExcerpt:'Other'},
]};
const landing=prepareSeoJev({task:'landing-page-match',data:matches,profile:lp});
assert.equal(landing.chosenCount,1);
assert.equal(landing.skippedCount,1);
assert.equal(landing.items[0].state.adPromise,'Работы под ключ со сметой');

const cp=await profile('seo-cannibalization');
const overlap={
  overlaps:[
    {query:'ремонт кровли омск',totalImpressions:125,pages:[
      {url:'/roof/',impressions:75,clicks:5,averagePosition:4.2},
      {url:'/roof-repair/',impressions:45,clicks:4,averagePosition:5.1},
      {url:'/roof-faq/',impressions:5,clicks:0,averagePosition:9.1},
    ]},
  ],
  pageSnapshots:[
    {url:'https://site.test/roof/',title:'Кровельные работы',summary:'Заказ кровельных работ с замером и сметой.'},
    {url:'/roof-repair/',title:'Ремонт кровли',summary:'Ремонт повреждений, восстановление гидроизоляции.'},
  ],
};
const can=prepareSeoJev({task:'seo-cannibalization',data:overlap,profile:cp});
assert.equal(can.chosenCount,1);
assert.equal(can.skippedCount,2,'missing page context must skip other pairs');
assert.equal(can.items[0].state.firstPage.title,'Кровельные работы');
assert.equal(can.items[0].state.secondPage.title,'Ремонт кровли');
assert.equal(can.items[0].state.firstPage.impressions,75);
assert.ok(can.skipped.every(row=>row.reason==='missing-page-snapshot'));
assert.throws(()=>prepareSeoJev({task:'seo-cannibalization',
 data:{overlaps:overlap.overlaps,pageSnapshots:[]},profile:cp}),/no eligible candidates/);
assert.throws(()=>prepareSeoJev({task:'seo-cannibalization',data:{
 overlaps:overlap.overlaps,pageSnapshots:[...overlap.pageSnapshots,{...overlap.pageSnapshots[1]}],
},profile:cp}),/duplicate page snapshot/);

const simulated={ 'search-term-triage':tprofile,'landing-page-match':lp,'seo-cannibalization':cp };
function fakeDecision(task){
 const answers={};
 for(const [key,question] of Object.entries(simulated[task].questions)){
   const first=Object.keys(question.criteria||{})[0];
   answers[key]=question.type==='choice'
     ? {type:'choice',choice:first,confidence:0.92,probabilities:{[first]:0.92}}
     : question.type==='noul'
     ? {type:'noul',noul:0.95}
     : {type:'score',score:2,confidence:0.87};
 }
 return {model:'typesafe/jev-1.13',answers,usage:{input_tokens:60,output_tokens:0,cost:0.00000252}};
}
for(const item of [
 {task:'search-term-triage',prepared:batch,profile:tprofile},
 {task:'landing-page-match',prepared:landing,profile:lp},
 {task:'seo-cannibalization',prepared:can,profile:cp},
]){
 let calls=0;
 const evidence=await evaluateItemsWithJev({
   items:item.prepared.items,profile:item.profile,apiKey:'fake',
   callDecision:async()=>{calls++;return fakeDecision(item.task);},
 });
 assert.equal(calls,item.prepared.items.length);
 const route=routeSeoJev({prepared:item.prepared,evidence,profile:item.profile});
 assert.equal(route.summary.items,item.prepared.chosenCount);
 assert.equal(route.rows.every(x=>x.humanApprovalRequired&&!x.actionApplied),true);
 assert.equal(route.policy.autopublish,false);
 assert.equal(route.policy.autoNegativeKeywords,false);
 assert.equal(route.policy.autoMerge,false);
 assert.equal(route.summary.missingCostCount,0);
 assert.equal(route.rows[0].priority,'priority_review');
 const changed=structuredClone(item.prepared);
 changed.items[0].state.hijack='changed';
 assert.throws(()=>routeSeoJev({prepared:changed,evidence,profile:item.profile}),/does not match source item/);
 const missing=structuredClone(evidence);
 missing.evaluations.pop();
 assert.throws(()=>routeSeoJev({prepared:item.prepared,evidence:missing,profile:item.profile}),/missing or extra/);
 const changedProfile=structuredClone(evidence);
 changedProfile.profile.reviewThreshold=0.1;
 assert.throws(()=>routeSeoJev({prepared:item.prepared,evidence:changedProfile,profile:item.profile}),/profile changed/);
}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-jev-seo-'));
try{
 const input=path.join(temp,'terms.json'),prep=path.join(temp,'prepared.json'),res=path.join(temp,'evaluated.json'),report=path.join(temp,'review.json');
 await fs.writeFile(input,JSON.stringify(terms));
 const run=(a)=>spawnSync(process.execPath,['scripts/jev-seo.mjs',...a],{
   cwd:path.resolve('.'),encoding:'utf8',
   env:{...process.env,YAIS_AI:'',OPENROUTER_API_KEY:''},
 });
 const prepared=run(['prepare','--task','search-term-triage','--input',input,'--out',prep,'--limit','2']);
 assert.equal(prepared.status,0,prepared.stderr);
 assert.match(prepared.stdout,/"paidCalls": 0/);
 assert.equal((JSON.parse(await fs.readFile(prep,'utf8'))).chosenCount,2);
 const again=run(['prepare','--task','search-term-triage','--input',input,'--out',prep]);
 assert.notEqual(again.status,0,'must never replace old evidence');
 const ev=await evaluateItemsWithJev({items:batch.items,profile:tprofile,
   callDecision:async()=>fakeDecision('search-term-triage')});
 await fs.writeFile(res,JSON.stringify(ev));
 const offline=run(['route','--prepared',prep,'--evaluations',res,'--out',report]);
 assert.equal(offline.status,0,offline.stderr);
 assert.match(offline.stdout,/"paidCalls": 0/);
 const output=JSON.parse(await fs.readFile(report,'utf8'));
 assert.equal(output.summary.items,2);
 assert.equal(output.rows[0].actionApplied,false);
 const modified=structuredClone(ev);
 modified.evaluations[0].stateHash='tampered';
 await fs.writeFile(res,JSON.stringify(modified));
 const fail=run(['route','--prepared',prep,'--evaluations',res,'--out',path.join(temp,'refused.json')]);
 assert.notEqual(fail.status,0);
 assert.match(fail.stderr,/does not match source item/);
}finally{await fs.rm(temp,{recursive:true,force:true});}
console.log('Jev SEO decision workflows selftest: ok (3 real adapters, strict provenance, no paid calls, human-only actions)');
