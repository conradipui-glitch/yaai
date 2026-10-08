import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { analyzeRows } from '../lib/analyze.mjs';
import { buildPagePlan } from '../public/page-planner.js';
import { createLocalHttpGuard } from '../lib/http-guard.mjs';
import { optionalNonnegativeNumber, maxOptionalNumber, formatOptionalNumber } from '../lib/optional-number.mjs';

const guard=createLocalHttpGuard({port:8787,maxPaidRequests:2,token:'f'.repeat(64)});
const req=(method,headers)=>({method,headers});
const local={host:'127.0.0.1:8787',origin:'http://127.0.0.1:8787','content-type':'application/json','x-yaai-local-token':'f'.repeat(64),'sec-fetch-site':'same-origin'};
assert.equal(guard.check(req('GET',{host:'127.0.0.1:8787'})),null);
assert.equal(guard.check(req('POST',local)),null);
assert.equal(guard.check(req('POST',{...local,host:'localhost:8787',origin:'http://localhost:8787'})),null);
assert.equal(guard.check(req('POST',{...local,host:'example.org:8787'})).status,403);
assert.equal(guard.check(req('POST',{...local,origin:'http://malicious.test'})).status,403);
assert.equal(guard.check(req('POST',{...local,'sec-fetch-site':'cross-site'})).status,403);
assert.equal(guard.check(req('POST',{...local,'content-type':'text/plain'})).status,415);
assert.equal(guard.check(req('POST',{...local,'x-yaai-local-token':'fake'})).status,403);
assert.equal(guard.check(req('POST',{host:'127.0.0.1:8787','content-type':'application/json'})).status,403);
assert.equal(guard.stats().paidAttempts,0);
assert.deepEqual(guard.reservePaidRequest(),{paidAttempts:1,paidRequestsRemaining:1});
assert.deepEqual(guard.reservePaidRequest(),{paidAttempts:2,paidRequestsRemaining:0});
assert.throws(()=>guard.reservePaidRequest(),/budget exhausted/);
assert.equal(guard.stats().paidAttempts,2);
for(const value of [null,undefined,'',false,true,'nope',NaN,-10,Infinity])assert.equal(optionalNonnegativeNumber(value),null);
assert.equal(optionalNonnegativeNumber(0),0);
assert.equal(optionalNonnegativeNumber('0'),0);
assert.equal(optionalNonnegativeNumber('42'),42);
assert.equal(maxOptionalNumber(null,null),null);
assert.equal(maxOptionalNumber(null,0),0);
assert.equal(maxOptionalNumber(2,null),2);
assert.equal(maxOptionalNumber(2,6),6);
assert.equal(formatOptionalNumber(null),'нет данных');
assert.equal(formatOptionalNumber(0),'0');

const preset=JSON.parse(await fs.readFile('examples/workspace/presets/example.json','utf8'));
const planner=JSON.parse(await fs.readFile('examples/workspace/planners/example.json','utf8'));
const analysis=analyzeRows([{
  phrase:'buy widget online', regionId:'1',regionName:'Example Region',
  count:null,types:['top'],seeds:['buy widget'],
}],preset,{includeTop:true,includeAssociations:false});
assert.equal(analysis.assignedRows[0].count,null);
assert.equal(analysis.summary.find(x=>x.intentId==='EX01').maxCount,null);
assert.equal(analysis.summary.find(x=>x.intentId==='EX01').relativeDemandBand,'unknown');
const pagePlan=buildPagePlan(analysis,{id:preset.id,pagePlanner:planner});
const landing=pagePlan.pages.find(x=>x.planId==='example-main');
assert.equal(landing.maxCount,null);
assert.equal(landing.topQueries[0].count,null);

console.log('audit safety and optional-number selftest: ok');
