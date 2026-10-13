import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {callJevDecision} from '../lib/jev.mjs';
import {evaluateItemsWithJev} from '../lib/evaluation.mjs';
import {createJevCheckpointStore} from '../lib/jev-checkpoints.mjs';
import {
  JEV_PROVIDER_IDS,diagnoseJevProviders,getJevProvider,
  resolveJevCredential,validateJevProviderModel,
} from '../lib/jev-providers.mjs';
import {routeSeoJev,prepareSeoJev} from '../lib/jev-seo-workflows.mjs';

assert.deepEqual(JEV_PROVIDER_IDS,['openrouter','typesafe']);
const open=getJevProvider('openrouter'),direct=getJevProvider('typesafe');
assert.equal(open.endpoint,'https://openrouter.ai/api/alpha/decisions');
assert.equal(direct.endpoint,'https://api.typesafe.ai/v1/systemone');
assert.equal(open.defaultModel,'typesafe/jev-1.13');
assert.equal(direct.defaultModel,'jev-1.13.0');
assert.throws(()=>getJevProvider('https://my.server'),/Unsupported Jev provider/);
assert.throws(()=>validateJevProviderModel('typesafe','typesafe/jev-1.13'),/does not match provider/);
assert.throws(()=>validateJevProviderModel('openrouter','jev-1.13.0'),/does not match provider/);
assert.throws(()=>validateJevProviderModel('typesafe','javascript:evil'),/does not match provider/);
assert.equal(resolveJevCredential('openrouter',{
 YAIS_AI:'or-secret',TYPESAFE_API_KEY:'wrong',
}),'or-secret');
assert.equal(resolveJevCredential('typesafe',{
 YAIS_AI:'wrong',TYPESAFE_API_KEY:'ts-secret',
}),'ts-secret');
assert.equal(resolveJevCredential('typesafe',{YAIS_AI:'or-secret'}),'');
const safe=diagnoseJevProviders({provider:'typesafe',
  env:{TYPESAFE_API_KEY:'ultra-secret',OPENROUTER_API_KEY:'old-secret'}});
assert.equal(safe.credentialPresent,true);
assert.equal(safe.model,'jev-1.13.0');
assert.equal(safe.keyValidatedByProvider,false);
assert.equal(safe.networkCalled,false);
assert.equal(safe.paidRequests,0);
assert.equal(safe.priceVerified,false);
assert.ok(!JSON.stringify(safe).includes('ultra-secret'));
assert.ok(!JSON.stringify(safe).includes('old-secret'));

const q={
 route:{type:'choice',instructions:'Choose relevant route',criteria:{sales:'sales lead',support:'support request'}},
 active:{type:'noul',instructions:'Does customer need a reply?'},
 quality:{type:'score',instructions:'Rate quality',criteria:['poor','good','great']},
};
const payload=(model,withCost=true)=>({
 model,answers:{
  route:{type:'choice',choice:'sales',confidence:0.92,
    probabilities:{sales:0.95,support:0.05}},
  active:{type:'noul',noul:0.85},
  quality:{type:'score',score:1.6,confidence:0.72,
    probabilities:{0:0.1,1:0.2,2:0.7}},
 },
 usage:{input_tokens:42,output_tokens:8,...(withCost?{cost:0.00006}:{})},
});
const requests=[];
const fakeFetch=async (url,options)=>{
 requests.push({url,headers:options.headers,body:JSON.parse(options.body)});
 return {ok:true,status:200,text:async()=>JSON.stringify(payload(
  url.includes('typesafe.ai')?'jev-1.13.0':'typesafe/jev-1.13',
  !url.includes('typesafe.ai')))};
};
for(const provider of JEV_PROVIDER_IDS){
 const apiKey=provider==='typesafe'?'ts-test-secret':'or-test-secret';
 const model=getJevProvider(provider).defaultModel;
 const r=await callJevDecision({provider,apiKey,state:{customer:'quoted'},
   questions:q,fetchImpl:fakeFetch});
 assert.equal(r.answers.route.choice,'sales');
 const last=requests.at(-1);
 assert.equal(last.url,getJevProvider(provider).endpoint);
 assert.equal(last.headers.Authorization,'Bearer '+apiKey);
 assert.deepEqual(last.body,{model,state:{customer:'quoted'},questions:q});
}
assert.equal(requests.length,2);
await assert.rejects(callJevDecision({provider:'typesafe',
  apiKey:'secret-should-not-leak',state:'a',questions:q,
  fetchImpl:async()=>({ok:false,status:401,
    text:async()=>JSON.stringify({error:{message:'token secret-should-not-leak'}})}),
}),err=>err.message.includes('HTTP 401')&&!err.message.includes('secret-should-not-leak'));
await assert.rejects(callJevDecision({provider:'typesafe',apiKey:'',
  state:'a',questions:q,fetchImpl:async()=>{throw Error('should not call');}}),/key is missing/);

const profile={id:'cross-provider-proof',name:'Proof',questions:q,
 reviewThreshold:0.8,reviewQuestions:['route']};
const items=[{id:'same-id',state:{text:'Need sales'},meta:{source:'mock'}}];
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-providers-'));
try {
 const checkpoint=createJevCheckpointStore(path.join(temp,'cache'));
 let paid=0;
 const evalProvider=async provider=>evaluateItemsWithJev({
  items,profile,provider,model:getJevProvider(provider).defaultModel,
  checkpoint,apiKey:'mock',
  callDecision:async ({provider})=>{
   paid++;return payload(provider==='typesafe'?'jev-1.13.0':'typesafe/jev-1.13',provider!=='typesafe');
  },
 });
 const or=await evalProvider('openrouter');
 assert.equal(paid,1);
 assert.equal(or.source,'openrouter-decisions');
 assert.equal(or.summary.totalCost,0.00006);
 const ts=await evalProvider('typesafe');
 assert.equal(paid,2,'different transport must never reuse an OpenRouter paid checkpoint');
 assert.equal(ts.source,'typesafe-systemone');
 assert.equal(ts.transportProvider,'typesafe');
 assert.equal(ts.evaluations[0].transportProvider,'typesafe');
 assert.equal(ts.summary.totalCost,null,'unreported cost must remain unknown');
 assert.equal(ts.summary.missingCostCount,1);
 const again=await evalProvider('typesafe');
 assert.equal(paid,2);
 assert.equal(again.summary.reusedCount,1);
 const openAgain=await evalProvider('openrouter');
 assert.equal(openAgain.summary.reusedCount,1);
 assert.equal(paid,2);
 const fakeTypesafe=structuredClone(ts);
 fakeTypesafe.transportProvider='openrouter';
 const seoProfile=JSON.parse(await fs.readFile('examples/evaluation-profiles/search-term-triage.json','utf8'));
 const prepared=prepareSeoJev({task:'search-term-triage',profile:seoProfile,
   data:{terms:[{query:'купить CRM'}]}});
 const evalSeo=await evaluateItemsWithJev({items:prepared.items,profile:seoProfile,
   provider:'typesafe',model:'jev-1.13.0',apiKey:'mock',callDecision:async()=>({
    model:'jev-1.13.0',usage:{input_tokens:10,output_tokens:5},
    answers:{
     intent:{type:'choice',choice:'buyer',confidence:0.9},
     buyer_intent:{type:'noul',noul:0.9},
     next_step_value:{type:'score',score:2.3,confidence:0.9},
    },
   })});
 const routed=routeSeoJev({prepared,evidence:evalSeo,profile:seoProfile});
 assert.equal(routed.rows.length,1);
 assert.equal(routed.rows[0].humanApprovalRequired,true);
 assert.equal(routed.summary.totalCostUsd,null);
 assert.throws(()=>routeSeoJev({prepared,evidence:{...evalSeo,transportProvider:'openrouter'},
   profile:seoProfile}),/invalid prepared batch/);

 // Offline CLI read-only doctor: no HTTP, no secrets printed or written.
 const cli=(args,env={})=>spawnSync(process.execPath,['scripts/jev-provider.mjs',...args],{
  cwd:path.resolve('.'),encoding:'utf8',env:{...process.env,
    TYPESAFE_API_KEY:'top-secret-value',YAIS_AI:'',YAAI_JEV_PROVIDER:'',
    YAAI_JEV_MODEL:'',...env}});
 const diag=cli(['--provider','typesafe']);
 assert.equal(diag.status,0,diag.stderr);
 const obj=JSON.parse(diag.stdout);
 assert.equal(obj.credentialPresent,true);
 assert.equal(obj.paidRequests,0);
 assert.equal(obj.model,'jev-1.13.0');
 assert.doesNotMatch(diag.stdout,/top-secret-value/);
 const absent=cli(['--provider','typesafe','--require-key'],
   {TYPESAFE_API_KEY:'',YAAI_TYPESAFE_API_KEY:''});
 assert.equal(absent.status,1);
 const bad=cli(['--provider','typesafe','--model','typesafe/jev-1.13']);
 assert.notEqual(bad.status,0);
 assert.doesNotMatch(bad.stderr,/top-secret-value/);
 const unauthorized=spawnSync(process.execPath,[
    'scripts/jev-evaluate.mjs','--provider','typesafe'
   ],{cwd:path.resolve('.'),encoding:'utf8',
      env:{...process.env,TYPESAFE_API_KEY:'top-secret-value'}});
 assert.notEqual(unauthorized.status,0);
 assert.match(unauthorized.stderr,/Add --execute explicitly/);
 assert.doesNotMatch(unauthorized.stderr,/top-secret-value/);
}finally{await fs.rm(temp,{recursive:true,force:true});}
console.log('Jev provider selftest: ok (fixed hosts, independent secrets, direct typed decisions, isolated caches, no paid calls)');
