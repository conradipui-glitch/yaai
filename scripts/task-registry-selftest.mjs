import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTask, readTask, listTasks } from '../lib/task-registry.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-workspace-tasks-'));
const other=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-task-isolation-'));
try {
  for (const dir of [root,other]) {
    await fs.mkdir(path.join(dir,'cases'));
    for(const id of ['alpha','beta']){
      await fs.writeFile(path.join(dir,'cases',id+'.json'),JSON.stringify({id,name:id,resultPrefix:id}));
    }
  }
  const first=await createTask({
    workspaceRoot:root,caseId:'alpha',kind:'research',
    title:'  Analyse saved keywords  ',description:'No paid API calls',
  });
  assert.match(first.id,/^task-[0-9a-f-]{36}$/);
  assert.equal(first.title,'Analyse saved keywords');
  assert.equal(first.status,'draft');
  assert.equal(first.policy.executed,false);
  assert.equal(first.policy.paidCallsAuthorized,false);
  assert.equal(first.policy.externalMutationsAuthorized,false);
  assert.equal(first.events.length,1);
  assert.equal(first.events[0].type,'draft_created');
  const second=await createTask({workspaceRoot:root,caseId:'beta',kind:'report',title:'Prepare HTML report'});
  assert.notEqual(first.id,second.id);
  assert.deepEqual(await readTask({workspaceRoot:root,id:first.id}),first);
  assert.equal((await listTasks({workspaceRoot:root})).total,2);
  assert.equal((await listTasks({workspaceRoot:root,caseId:'alpha'})).tasks[0].id,first.id);
  assert.equal((await listTasks({workspaceRoot:root,caseId:'beta'})).tasks[0].id,second.id);
  assert.equal((await listTasks({workspaceRoot:root,caseId:'alpha',limit:1})).total,1);
  assert.equal((await listTasks({workspaceRoot:other})).total,0);
  await assert.rejects(readTask({workspaceRoot:other,id:first.id}),{code:'ENOENT'});
  await assert.rejects(createTask({workspaceRoot:root,caseId:'../alpha',title:'bad'}),/Invalid case id/);
  await assert.rejects(createTask({workspaceRoot:root,caseId:'missing',title:'bad'}),{code:'ENOENT'});
  await assert.rejects(createTask({workspaceRoot:root,caseId:'alpha',kind:'execute',title:'bad'}),/unsupported task kind/);
  await assert.rejects(createTask({workspaceRoot:root,caseId:'alpha',title:'bad',origin:'mcp'}),/writes from this interface/);
  await assert.rejects(createTask({workspaceRoot:root,caseId:'alpha',title:' '.repeat(4)}),/title/);
  await assert.rejects(readTask({workspaceRoot:root,id:'../../.env'}),/invalid task ID/);
  await assert.rejects(listTasks({workspaceRoot:root,limit:500}),/list limit/);
  // Simulate a fresh process, with no API credentials.
  const cli=(args)=>spawnSync(process.execPath,['scripts/task.mjs',...args],{
    cwd:path.resolve('.'),encoding:'utf8',env:{
      ...process.env,OPENROUTER_API_KEY:'',YAIS_AI:'',YANDEX_API_KEY:'',YAAI_WORKSPACE:'',
    },
  });
  const cliCreated=cli(['create','--workspace',root,'--case','alpha',
    '--kind','evaluation','--title','Review already stored evidence']);
  assert.equal(cliCreated.status,0,cliCreated.stderr);
  const third=JSON.parse(cliCreated.stdout);
  assert.equal(third.status,'draft');
  const cliRead=cli(['show','--workspace',root,'--id',third.id]);
  assert.equal(cliRead.status,0,cliRead.stderr);
  assert.deepEqual(JSON.parse(cliRead.stdout),third);
  const cliList=cli(['list','--workspace',root,'--case','alpha']);
  assert.equal(cliList.status,0,cliList.stderr);
  assert.equal(JSON.parse(cliList.stdout).total,2);
  const rejectedImplicit=cli(['list']);
  assert.notEqual(rejectedImplicit.status,0,'No implicit engine workspace');
  assert.match(rejectedImplicit.stderr,/Specify --workspace/);
  const stat=await fs.lstat(path.join(root,'tasks',third.id+'.json'));
  assert.ok(stat.isFile());
  assert.equal(stat.mode&0o077,0,'Task data is owner-only on POSIX test runner');
  const dataPath=path.join(root,'tasks',second.id+'.json');
  const tampered=structuredClone(second);tampered.status='complete';
  await fs.writeFile(dataPath,JSON.stringify(tampered));
  await assert.rejects(readTask({workspaceRoot:root,id:second.id}),/invalid or corrupted task record/);
  // Listing fails closed on corrupted saved data instead of pretending success.
  await assert.rejects(listTasks({workspaceRoot:root}),/invalid or corrupted task record/);
  const unsafe=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-task-symlink-'));
  try{
    await fs.mkdir(path.join(unsafe,'cases'));
    await fs.writeFile(path.join(unsafe,'cases','alpha.json'),JSON.stringify({id:'alpha'}));
    await fs.mkdir(path.join(other,'tasks'));
    await fs.symlink(path.join(other,'tasks'),path.join(unsafe,'tasks'));
    await assert.rejects(createTask({workspaceRoot:unsafe,caseId:'alpha',title:'secret'}),/unsafe storage directory/);
  }finally{await fs.rm(unsafe,{recursive:true,force:true});}
}finally{
  await fs.rm(root,{recursive:true,force:true});
  await fs.rm(other,{recursive:true,force:true});
}
console.log('YA AI task registry selftest: ok (workspace isolation, durable drafts, read-only MCP boundary, no paid APIs)');
