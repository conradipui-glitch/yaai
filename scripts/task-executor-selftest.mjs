import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createTask} from '../lib/task-registry.mjs';
import {linkSavedArtifact} from '../lib/task-results.mjs';
import {runOfflineTask,readTaskWithExecution,listTasksWithExecution,
  recoverInterruptedTask} from '../lib/task-executor.mjs';

const home=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-task-executor-'));
const elsewhere=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-task-client-'));
const csv=[
 'Дата;URL;Запрос;Клики;Показы;Позиция',
 '2026-10-01;https://site.example/a;купить баню;4;20;4',
 '2026-10-01;https://site.example/b;купить баню;2;12;7',
 '2026-10-02;https://site.example/a;ремонт бани;1;4;11',
].join('\n');
const cli=args=>spawnSync(process.execPath,['scripts/task.mjs',...args],{
  encoding:'utf8',cwd:path.resolve('.'),
  env:{...process.env,OPENROUTER_API_KEY:'',YAIS_AI:'',YANDEX_API_KEY:'',YAAI_WORKSPACE:''},
});
try {
  for(const root of [home,elsewhere]){
    await fs.mkdir(path.join(root,'cases'),{recursive:true});
    await fs.mkdir(path.join(root,'inputs','demo'),{recursive:true});
    await fs.mkdir(path.join(root,'results'),{recursive:true});
    await fs.writeFile(path.join(root,'cases','demo.json'),JSON.stringify({id:'demo',resultPrefix:'demo'}));
    await fs.writeFile(path.join(root,'cases','other.json'),JSON.stringify({id:'other',resultPrefix:'other'}));
  }
  const input=path.join(home,'inputs','demo','webmaster.csv');
  await fs.writeFile(input,csv);
  const task=await createTask({workspaceRoot:home,caseId:'demo',kind:'research',title:'Offline Webmaster overlap'});
  assert.equal((await readTaskWithExecution({workspaceRoot:home,id:task.id})).status,'draft');
  const result=await runOfflineTask({workspaceRoot:home,id:task.id});
  assert.equal(result.status,'succeeded');
  assert.equal(result.execution.job,'webmaster-overlap');
  assert.equal(result.policy.executed,true,'view reflects actual local attempt');
  assert.equal(result.execution.attempts,1);
  assert.equal(result.execution.billableCallsMadeByThisJob,0);
  assert.equal(result.execution.billableCallsAuthorized,false);
  assert.equal(result.policy.paidCallsAuthorized,false);
  assert.equal(result.execution.externalMutationsMade,false);
  const rawDraft=JSON.parse(await fs.readFile(path.join(home,'tasks',task.id+'.json'),'utf8'));
  assert.equal(rawDraft.policy.executed,false,'original immutable draft describes pre-run state');
  assert.equal(result.events.map(x=>x.type).join(','),'draft_created,run_started,run_succeeded');
  assert.equal(result.execution.output.path.startsWith('results/demo-webmaster-overlap-task-'),true);
  const saved=JSON.parse(await fs.readFile(path.join(home,result.execution.output.path),'utf8'));
  assert.equal(saved.source,'yaai-webmaster-overlap-task');
  assert.equal(saved.caseId,'demo');
  assert.equal(saved.runAttempt,1);
  assert.equal(saved.candidateCount,1);
  assert.equal(saved.overlaps[0].query,'купить баню');
  assert.equal(saved.summary.measuredCostUsd,null);
  await assert.rejects(runOfflineTask({workspaceRoot:home,id:task.id}),/already started/);
  await assert.rejects(runOfflineTask({workspaceRoot:home,id:task.id,mode:'retry'}),/no failed\/interrupted/);
  await assert.rejects(runOfflineTask({workspaceRoot:elsewhere,id:task.id}),/task not found/);
  const afterRestart=cli(['show','--workspace',home,'--id',task.id]);
  assert.equal(afterRestart.status,0,afterRestart.stderr);
  assert.deepEqual(JSON.parse(afterRestart.stdout),result);
  const listed=cli(['list','--workspace',home,'--case','demo']);
  assert.equal(listed.status,0,listed.stderr);
  assert.equal(JSON.parse(listed.stdout).tasks[0].status,'succeeded');

  const bad=await createTask({workspaceRoot:home,caseId:'other',kind:'research',title:'Other client not in demo'});
  const invalid=await runOfflineTask({workspaceRoot:home,id:bad.id});
  assert.equal(invalid.status,'failed');
  assert.equal(invalid.execution.errorCode,'INPUT_UNAVAILABLE');
  assert.equal(invalid.execution.attempts,1);
  const otherInput=path.join(home,'inputs','other');
  await fs.mkdir(otherInput,{recursive:true});
  await fs.writeFile(path.join(otherInput,'webmaster.csv'),'invalid,header\nfoo,bar');
  const retryBad=await runOfflineTask({workspaceRoot:home,id:bad.id,mode:'retry'});
  assert.equal(retryBad.status,'failed');
  assert.equal(retryBad.execution.attempts,2);
  assert.equal(retryBad.execution.errorCode,'INPUT_INVALID');
  await fs.writeFile(path.join(otherInput,'webmaster.csv'),csv);
  const retryGood=await runOfflineTask({workspaceRoot:home,id:bad.id,mode:'retry'});
  assert.equal(retryGood.status,'succeeded');
  assert.equal(retryGood.execution.attempts,3);
  await assert.rejects(runOfflineTask({workspaceRoot:home,id:bad.id,mode:'retry'}),/no failed\/interrupted/);
  const attemptEvents=retryGood.events.map(x=>x.type);
  assert.deepEqual(attemptEvents,[
    'draft_created','run_started','run_failed','run_started','run_failed','run_started','run_succeeded',
  ]);
  const draft=await createTask({workspaceRoot:home,caseId:'demo',title:'Link only'});
  await fs.writeFile(path.join(home,'results','demo-earlier.json'),
    JSON.stringify({source:'existing',caseId:'demo',summary:{measuredModelCostUsd:null}}));
  const linked=await linkSavedArtifact({workspaceRoot:home,id:draft.id,relativeJsonPath:'results/demo-earlier.json'});
  assert.equal(linked.status,'result_linked');
  await assert.rejects(runOfflineTask({workspaceRoot:home,id:draft.id}),/already linked/);

  // Persist an interrupted start (simulate process loss between start and end),
  // then require explicit same-host recovery and retry: never automatic.
  const lost=await createTask({workspaceRoot:home,caseId:'demo',title:'Crash fixture'});
  const base=path.join(home,'tasks','executions',lost.id);
  await fs.mkdir(base,{recursive:true});
  const start={schemaVersion:1,taskId:lost.id,caseId:'demo',job:'webmaster-overlap',
    mode:'offline',origin:'cli',phase:'start',attempt:1,at:new Date().toISOString()};
  await fs.writeFile(path.join(base,'001-start.json'),JSON.stringify(start));
  await fs.mkdir(path.join(base,'.lock'));
  await fs.writeFile(path.join(base,'.lock','owner.json'),
    JSON.stringify({taskId:lost.id,pid:2147483647,hostname:os.hostname(),createdAt:start.at}));
  const interrupted=await readTaskWithExecution({workspaceRoot:home,id:lost.id});
  assert.equal(interrupted.status,'interrupted');
  await assert.rejects(runOfflineTask({workspaceRoot:home,id:lost.id,mode:'retry'}),/job locked/);
  const recovered=await recoverInterruptedTask({workspaceRoot:home,id:lost.id});
  assert.equal(recovered.status,'interrupted');
  const resumed=await runOfflineTask({workspaceRoot:home,id:lost.id,mode:'retry'});
  assert.equal(resumed.status,'succeeded');
  assert.equal(resumed.execution.attempts,2);
  await assert.rejects(recoverInterruptedTask({workspaceRoot:home,id:lost.id}),/only interrupted/);

  const readOnly=await listTasksWithExecution({workspaceRoot:home,caseId:'demo'});
  assert.equal(readOnly.total,3);
  const badScope=await listTasksWithExecution({workspaceRoot:home,caseId:'other'});
  assert.equal(badScope.total,1);
  const hidden=await listTasksWithExecution({workspaceRoot:elsewhere});
  assert.equal(hidden.total,0);

  // Never report a corrupted result as complete.
  const saveFile=path.join(home,result.execution.output.path);
  const original=await fs.readFile(saveFile);
  await fs.writeFile(saveFile,JSON.stringify({...saved,candidateCount:999}));
  await assert.rejects(readTaskWithExecution({workspaceRoot:home,id:task.id}),/completed output changed/);
  await assert.rejects(listTasksWithExecution({workspaceRoot:home}),/completed output changed/);
  await fs.writeFile(saveFile,original);
  assert.equal((await readTaskWithExecution({workspaceRoot:home,id:task.id})).status,'succeeded');

  const symTask=await createTask({workspaceRoot:home,caseId:'demo',title:'Unsafe symlink CSV'});
  const inputBefore=await fs.readFile(input);
  await fs.unlink(input);
  await fs.symlink(path.join(home,'results','demo-earlier.json'),input);
  const unsafe=await runOfflineTask({workspaceRoot:home,id:symTask.id});
  assert.equal(unsafe.status,'failed');
  assert.equal(unsafe.execution.errorCode,'INPUT_INVALID');
  await fs.unlink(input);await fs.writeFile(input,inputBefore);

  // A live lock cannot be removed, even by explicit recover.
  const active=await createTask({workspaceRoot:home,caseId:'demo',title:'Live worker simulation'});
  const activeDir=path.join(home,'tasks','executions',active.id);
  await fs.mkdir(path.join(activeDir,'.lock'),{recursive:true});
  await fs.writeFile(path.join(activeDir,'001-start.json'),JSON.stringify({
    ...start,taskId:active.id
  }));
  await fs.writeFile(path.join(activeDir,'.lock','owner.json'),
    JSON.stringify({taskId:active.id,pid:process.pid,hostname:os.hostname()}));
  await assert.rejects(recoverInterruptedTask({workspaceRoot:home,id:active.id}),/worker is still alive/);
}finally{
  await fs.rm(home,{recursive:true,force:true});
  await fs.rm(elsewhere,{recursive:true,force:true});
}
console.log('YA AI offline executor selftest: ok (real CSV processor, restart, failure, retry, crash recovery, output integrity, 0 API)');
