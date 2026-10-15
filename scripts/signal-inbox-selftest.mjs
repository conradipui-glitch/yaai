import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createTask} from '../lib/task-registry.mjs';
import {runOfflineTask} from '../lib/task-executor.mjs';
import {linkSavedArtifact} from '../lib/task-results.mjs';
import {listSignals,acknowledgeSignal} from '../lib/signal-inbox.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-signal-inbox-'));
const cli=args=>spawnSync(process.execPath,['scripts/signals.mjs',...args],{
  cwd:path.resolve('.'),encoding:'utf8',env:{...process.env,YAAI_WORKSPACE:'',
    YAIS_AI:'',YANDEX_API_KEY:'',TYPESAFE_API_KEY:''},
});
const caseArgs=['--workspace',root,'--case','first'];
try {
  await fs.mkdir(path.join(root,'cases'));
  await fs.mkdir(path.join(root,'inputs','first'),{recursive:true});
  await fs.mkdir(path.join(root,'results'));
  for(const [id,prefix] of [['first','first'],['second','second']]){
    await fs.writeFile(path.join(root,'cases',id+'.json'),JSON.stringify({
      id,resultPrefix:prefix,regions:[],seeds:[],
    }));
  }
  const empty=await listSignals({workspaceRoot:root,caseId:'first'});
  assert.equal(empty.total,0);
  assert.equal(empty.unread,0);
  const failed=await createTask({workspaceRoot:root,caseId:'first',title:'Offline CSV error'});
  const firstRun=await runOfflineTask({workspaceRoot:root,id:failed.id});
  assert.equal(firstRun.status,'failed');
  const broken=await listSignals({workspaceRoot:root,caseId:'first'});
  assert.equal(broken.total,1);
  const failSignal=broken.signals[0];
  assert.match(failSignal.id,/^signal-[a-f0-9]{40}$/);
  assert.equal(failSignal.type,'run_failed');
  assert.equal(failSignal.severity,'warning');
  assert.equal(failSignal.taskId,failed.id);
  assert.equal(failSignal.errorCode,'INPUT_UNAVAILABLE');
  assert.equal(failSignal.acknowledged,false);
  assert.equal(broken.delivery,'local-only');
  assert.equal(broken.notificationSent,false);
  assert.deepEqual(await listSignals({workspaceRoot:root,caseId:'first'}),broken,
    'polling must not duplicate or change signal IDs');

  const ack=await acknowledgeSignal({
    workspaceRoot:root,caseId:'first',signalId:failSignal.id,
  });
  assert.equal(ack.acknowledged,true);
  assert.equal(ack.alreadyAcknowledged,undefined);
  const again=await acknowledgeSignal({
    workspaceRoot:root,caseId:'first',signalId:failSignal.id,
  });
  assert.equal(again.alreadyAcknowledged,true);
  assert.equal(again.acknowledgedAt,ack.acknowledgedAt);
  const persisted=await listSignals({workspaceRoot:root,caseId:'first'});
  assert.equal(persisted.unread,0);
  assert.equal(persisted.signals[0].acknowledgedAt,ack.acknowledgedAt);
  assert.equal((await listSignals({
    workspaceRoot:root,caseId:'first',includeAcknowledged:false,
  })).total,0);
  const fresh=cli(['list',...caseArgs]);
  assert.equal(fresh.status,0,fresh.stderr);
  assert.equal(JSON.parse(fresh.stdout).signals[0].acknowledged,true);
  assert.equal(JSON.parse(fresh.stdout).unread,0);
  const bad=cli(['ack',...caseArgs,'--id','../../.env']);
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/invalid signal ID/);

  const csv=[
    'Запрос;URL;Показы;Клики',
    'купить кровлю;/roof-a;22;4',
    'купить кровлю;/roof-b;18;3',
  ].join('\n');
  await fs.writeFile(path.join(root,'inputs','first','webmaster.csv'),csv);
  const retry=await runOfflineTask({workspaceRoot:root,id:failed.id,mode:'retry'});
  assert.equal(retry.status,'succeeded');
  const full=await listSignals({workspaceRoot:root,caseId:'first'});
  assert.equal(full.total,2);
  assert.equal(full.unread,1);
  const succeed=full.signals.find(x=>x.type==='run_succeeded');
  assert.ok(succeed);
  assert.equal(succeed.attempt,2);
  assert.equal(succeed.errorCode,null);
  assert.equal(full.signals.find(x=>x.id===failSignal.id).acknowledged,true);
  const ackFromCli=cli(['ack',...caseArgs,'--id',succeed.id]);
  assert.equal(ackFromCli.status,0,ackFromCli.stderr);
  assert.equal(JSON.parse(ackFromCli.stdout).acknowledged,true);

  const linkedTask=await createTask({
    workspaceRoot:root,caseId:'first',title:'Previously saved evidence',
  });
  await fs.writeFile(path.join(root,'results','first-old.json'),
    JSON.stringify({source:'saved',caseId:'first',summary:{}}));
  await linkSavedArtifact({workspaceRoot:root,id:linkedTask.id,
    relativeJsonPath:'results/first-old.json'});
  const old=await listSignals({workspaceRoot:root,caseId:'first'});
  assert.equal(old.total,3);
  assert.equal(old.signals.filter(x=>x.type==='artifact_linked').length,1);
  assert.equal(old.unread,1);
  const second=await createTask({workspaceRoot:root,caseId:'second',title:'Other client'});
  await fs.writeFile(path.join(root,'results','second-old.json'),
    JSON.stringify({source:'saved',caseId:'second',summary:{}}));
  await linkSavedArtifact({workspaceRoot:root,id:second.id,
    relativeJsonPath:'results/second-old.json'});
  assert.equal((await listSignals({workspaceRoot:root,caseId:'first'})).total,3);
  const foreign=await listSignals({workspaceRoot:root,caseId:'second'});
  assert.equal(foreign.total,1);
  assert.equal(foreign.signals[0].caseId,'second');
  await assert.rejects(acknowledgeSignal({
    workspaceRoot:root,caseId:'first',signalId:foreign.signals[0].id,
  }),/not found in selected client case/);
  await assert.rejects(listSignals({workspaceRoot:root,caseId:'../second'}),
    /Invalid case id/);
  await assert.rejects(listSignals({workspaceRoot:root,caseId:'first',limit:0}),
    /limit must be/);
  assert.equal((await listSignals({workspaceRoot:root,caseId:'first',limit:1})).omitted,2);

  // Produce a truly interrupted earlier attempt, then a successful retry.
  const interrupted=await createTask({
    workspaceRoot:root,caseId:'first',title:'Interrupted offline analysis',
  });
  const attempts=path.join(root,'tasks','executions',interrupted.id);
  await fs.mkdir(attempts,{recursive:true});
  const start={
    schemaVersion:1,taskId:interrupted.id,caseId:'first',job:'webmaster-overlap',
    mode:'offline',origin:'cli',phase:'start',attempt:1,at:new Date().toISOString(),
  };
  await fs.writeFile(path.join(attempts,'001-start.json'),JSON.stringify(start));
  const interruption=await listSignals({workspaceRoot:root,caseId:'first'});
  const lost=interruption.signals.find(x=>x.type==='run_interrupted');
  assert.ok(lost);
  assert.equal(lost.attempt,1);
  const returnToWork=await runOfflineTask({
    workspaceRoot:root,id:interrupted.id,mode:'retry',
  });
  assert.equal(returnToWork.status,'succeeded');
  const afterRetry=await listSignals({workspaceRoot:root,caseId:'first'});
  assert.equal(afterRetry.signals.find(x=>x.id===lost.id).type,'run_interrupted',
    'interruption remains in history after a successful retry');

  const ackDir=path.join(root,'tasks','signal-acks','first');
  const savedAck=path.join(ackDir,failSignal.id+'.json');
  const mode=(await fs.lstat(savedAck)).mode;
  assert.equal(mode&0o077,0,'ack record must be private on POSIX');
  const tampered=JSON.parse(await fs.readFile(savedAck,'utf8'));
  tampered.caseId='second';
  await fs.writeFile(savedAck,JSON.stringify(tampered));
  await assert.rejects(listSignals({workspaceRoot:root,caseId:'first'}),
    /corrupted acknowledgement/);
  assert.equal((await listSignals({workspaceRoot:root,caseId:'second'})).total,1,
    'a corrupted first-case acknowledgement cannot leak second-case data');
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('YA AI signal inbox selftest: ok (real task events, stable IDs, per-case ack, restart, retries, no API or delivery)');
