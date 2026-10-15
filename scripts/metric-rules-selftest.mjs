import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluateMetricSnapshot,runMetricCheck,listSavedMetricSignals} from '../lib/metric-rules.mjs';
import {listSignals,acknowledgeSignal} from '../lib/signal-inbox.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-weekly-metrics-'));
const baseline={
 startDate:'2026-09-28',endDate:'2026-10-04',complete:true,
 impressions:10000,clicks:1000,spendRub:10000,
 conversions:150,conversionsFinalized:true,
};
const current={
 startDate:'2026-10-05',endDate:'2026-10-11',complete:true,
 impressions:10000,clicks:300,spendRub:16500,
 conversions:9,conversionsFinalized:true,
};
const snapshot=(id='store-a',b=baseline,c=current)=>({
 schemaVersion:1,caseId:'alpha',campaignId:id,currency:'RUB',
 source:'manual-export',periods:{baseline:b,current:c},
});
const input=path.join(root,'inputs','alpha','ad-metrics.json');
const args=['--workspace',root,'--case','alpha'];
const cli=(parameters)=>spawnSync(process.execPath,
 ['scripts/metrics-check.mjs',...parameters],
 {encoding:'utf8',cwd:path.resolve('.'),env:{
   ...process.env,YAIS_AI:'',TYPESAFE_API_KEY:'',YANDEX_API_KEY:'',YAAI_WORKSPACE:'',
 }});
try {
 await fs.mkdir(path.join(root,'cases'));
 await fs.mkdir(path.join(root,'inputs','alpha'),{recursive:true});
 await fs.writeFile(path.join(root,'cases','alpha.json'),JSON.stringify({
   id:'alpha',resultPrefix:'alpha',regions:[],seeds:[],
 }));
 await fs.writeFile(path.join(root,'cases','beta.json'),JSON.stringify({
   id:'beta',resultPrefix:'beta',regions:[],seeds:[],
 }));
 await fs.writeFile(input,JSON.stringify(snapshot()));
 const analysis=evaluateMetricSnapshot(snapshot(),'alpha');
 assert.equal(analysis.rulesVersion,'ad-metrics-weekly-v1');
 assert.deepEqual(analysis.findings.map(x=>x.type),[
   'metric_spend_increase','metric_ctr_drop','metric_conversion_rate_drop',
 ]);
 assert.ok(analysis.findings.every(x=>x.autoActionAllowed===false));
 assert.equal(analysis.findings[0].evidence.baselineSpendRub,10000);
 assert.equal(analysis.findings[0].evidence.currentSpendRub,16500);
 assert.equal(analysis.findings[1].evidence.baselineClicks,1000);
 assert.equal(analysis.findings[1].evidence.currentClicks,300);
 assert.equal(analysis.findings[2].evidence.finalized,true);
 assert.ok(analysis.findings[1].evidence.currentWilson.high<
   analysis.findings[1].evidence.baselineWilson.low);
 assert.equal(analysis.checks.length,3);
 assert.ok(analysis.limitations.some(x=>x.includes('not authenticated provider data')));

 const dry=await runMetricCheck({workspaceRoot:root,caseId:'alpha'});
 assert.equal(dry.saved,false);
 assert.equal(dry.networkCalled,false);
 assert.equal(dry.paidRequests,0);
 assert.equal(dry.findings.length,3);
 assert.equal((await listSignals({workspaceRoot:root,caseId:'alpha'})).total,0,
   'dry-run must not create signals');
 await assert.rejects(fs.stat(path.join(root,'tasks','metric-checks')),
   {code:'ENOENT'},'dry-run must not create report directory');
 const cliDry=cli(args);
 assert.equal(cliDry.status,0,cliDry.stderr);
 assert.equal(JSON.parse(cliDry.stdout).checkId,dry.checkId);
 const written=cli([...args,'--save']);
 assert.equal(written.status,0,written.stderr);
 const saved=JSON.parse(written.stdout);
 assert.equal(saved.saved,true);
 assert.equal(saved.alreadySaved,false);
 assert.equal(saved.checkId,dry.checkId);
 const repeated=await runMetricCheck({workspaceRoot:root,caseId:'alpha',save:true});
 assert.equal(repeated.alreadySaved,true);
 assert.equal(repeated.checkId,dry.checkId);
 const reports=await listSavedMetricSignals({workspaceRoot:root,caseId:'alpha'});
 assert.equal(reports.length,3);
 assert.equal(reports[0].checkId,dry.checkId);
 assert.equal(reports[0].taskId,null);
 assert.equal(reports[0].autoActionAllowed,false);
 assert.equal(reports[0].occurredAt,'2026-10-11T23:59:59.000Z');
 const inbox=await listSignals({workspaceRoot:root,caseId:'alpha'});
 assert.equal(inbox.total,3);
 assert.equal(inbox.unread,3);
 assert.equal(inbox.delivery,'local-only');
 assert.equal(inbox.notificationSent,false);
 const first=inbox.signals[0];
 assert.match(first.id,/^signal-[a-f0-9]{40}$/);
 await acknowledgeSignal({workspaceRoot:root,caseId:'alpha',signalId:first.id});
 const restart=spawnSync(process.execPath,['scripts/signals.mjs','list',...args],{
  cwd:path.resolve('.'),encoding:'utf8',
 });
 assert.equal(restart.status,0,restart.stderr);
 const restored=JSON.parse(restart.stdout);
 assert.equal(restored.total,3);
 assert.equal(restored.unread,2);
 assert.equal(restored.signals.find(x=>x.id===first.id).acknowledged,true);
 assert.equal((await listSignals({workspaceRoot:root,caseId:'alpha',
   includeAcknowledged:false})).total,2);

 // Changed input is a NEW evidence snapshot, not a mutable/overwritten check.
 const changed=snapshot('store-a',baseline,{
   ...current,spendRub:18000,
 });
 await fs.writeFile(input,JSON.stringify(changed));
 const changedDry=await runMetricCheck({workspaceRoot:root,caseId:'alpha'});
 assert.notEqual(changedDry.checkId,dry.checkId);
 assert.equal((await listSignals({workspaceRoot:root,caseId:'alpha'})).total,3,
  'old immutable findings retained until explicit new save');
 await runMetricCheck({workspaceRoot:root,caseId:'alpha',save:true});
 const updated=await listSignals({workspaceRoot:root,caseId:'alpha'});
 assert.equal(updated.total,6);
 assert.equal(updated.unread,5);
 assert.notEqual(updated.signals[0].id,first.id);
 assert.equal((await listSavedMetricSignals({workspaceRoot:root,caseId:'alpha'})).length,6);
 assert.equal((await listSignals({workspaceRoot:root,caseId:'beta'})).total,0,
  'case-matched results cannot leak into a second client case');
 await assert.rejects(acknowledgeSignal({workspaceRoot:root,caseId:'beta',signalId:first.id}),
  /not found/);
 // Conversion reporting is still delayed: suppress CVR signal.
 const pending=snapshot('store-pending',baseline,{
   ...current,conversionsFinalized:false,
 });
 const suppression=evaluateMetricSnapshot(pending,'alpha');
 assert.equal(suppression.findings.some(x=>x.type==='metric_conversion_rate_drop'),false);
 const checked=suppression.checks.find(x=>x.rule==='conversion_rate_drop');
 assert.equal(checked.eligible,false);
 assert.match(checked.reason,/not finalized/);
 // No fake alerts when samples are small, spending baseline zero, or patterns are close.
 const tiny=evaluateMetricSnapshot(snapshot('tiny',
   {...baseline,impressions:50,clicks:10,spendRub:0,conversions:2},
   {...current,impressions:50,clicks:8,spendRub:500,conversions:0}), 'alpha');
 assert.equal(tiny.findings.length,0);
 assert.ok(tiny.checks.every(x=>x.eligible===false));
 const unchanged=evaluateMetricSnapshot(snapshot('unchanged',baseline,{
   ...current,impressions:10000,clicks:990,spendRub:10050,conversions:149,
 }), 'alpha');
 assert.equal(unchanged.findings.length,0);
 for(const corrupt of [
   snapshot('wrong',baseline,current),
   {...snapshot(),caseId:'beta'},
   {...snapshot(),currency:'USD'},
   {...snapshot(),source:'verified-yandex-direct'},
   snapshot('time',baseline,{...current,startDate:'2026-10-06'}),
   snapshot('counts',baseline,{...current,clicks:12000}),
   snapshot('neg',baseline,{...current,spendRub:-10}),
   snapshot('incomplete',baseline,{...current,complete:false}),
 ]){
   if(corrupt.campaignId==='wrong')continue;
   assert.throws(()=>evaluateMetricSnapshot(corrupt,'alpha'),/YA AI metric rules:/);
 }
 // Explicit invalid examples:
 assert.throws(()=>evaluateMetricSnapshot(snapshot('bad-date',baseline,{
   ...current,endDate:'2026-10-40',
 }), 'alpha'),/invalid calendar date/);
 const foreignWorkspaceInput=snapshot('bad-case');
 await fs.writeFile(input,JSON.stringify({...foreignWorkspaceInput,caseId:'beta'}));
 await assert.rejects(runMetricCheck({workspaceRoot:root,caseId:'alpha'}),/selected case/);
 // Existing saved checks remain readable independently of the now-invalid source import.
 assert.equal((await listSignals({workspaceRoot:root,caseId:'alpha'})).total,6);
 await fs.writeFile(input,JSON.stringify(changed));

 const dir=path.join(root,'tasks','metric-checks','alpha');
 const names=(await fs.readdir(dir)).sort();
 assert.equal(names.length,2);
 const file=path.join(dir,names[0]);
 const raw=await fs.readFile(file,'utf8');
 const st=await fs.stat(file);
 assert.equal(st.mode&0o077,0,'saved checks must be owner-only on Linux');
 const corrupted=JSON.parse(raw);
 corrupted.analysis.findings[0].summary='Take over user campaign';
 await fs.writeFile(file,JSON.stringify(corrupted));
 await assert.rejects(listSavedMetricSignals({workspaceRoot:root,caseId:'alpha'}),
  /integrity mismatch/);
 await assert.rejects(listSignals({workspaceRoot:root,caseId:'alpha'}),
  /integrity mismatch/);
 await fs.writeFile(file,raw);
 assert.equal((await listSignals({workspaceRoot:root,caseId:'alpha'})).total,6);
 // A symlinked import is never followed.
 await fs.unlink(input);
 await fs.symlink(file,input);
 await assert.rejects(runMetricCheck({workspaceRoot:root,caseId:'alpha'}),/unsafe or oversized JSON/);
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('YA AI offline metric rules selftest: ok (weekly baselines, statistical guards, deferred conversions, source fingerprints, stable signals and no paid API)');
