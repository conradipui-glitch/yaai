import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTask } from '../lib/task-registry.mjs';
import { linkSavedArtifact,readTaskWithArtifact,listTasksWithArtifacts } from '../lib/task-results.mjs';

const home=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-task-link-'));
const other=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-other-client-'));
const withoutSecrets={
  ...process.env,OPENROUTER_API_KEY:'',YAIS_AI:'',YANDEX_API_KEY:'',YAAI_WORKSPACE:'',
};
const cli=args=>spawnSync(process.execPath,['scripts/task.mjs',...args],{
  cwd:path.resolve('.'),env:withoutSecrets,encoding:'utf8',
});
try {
  for(const root of [home,other]) {
    await fs.mkdir(path.join(root,'cases'),{recursive:true});
    await fs.mkdir(path.join(root,'results'));
    await fs.writeFile(path.join(root,'cases','alpha.json'),
      JSON.stringify({id:'alpha',name:'Test research',resultPrefix:'alpha'}));
    await fs.writeFile(path.join(root,'cases','beta.json'),
      JSON.stringify({id:'beta',name:'Other research',resultPrefix:'beta'}));
  }
  const original={
    schemaVersion:1,source:'yaai-pain-discovery',caseId:'alpha',
    generatedAt:'2026-10-12T08:00:00.000Z',topic:'Заявки',
    summary:{acceptedEvidence:3,measuredModelCostUsd:0.0031},
    evidenceLedger:[{id:'a',query:'заявки теряются'}],
  };
  await fs.writeFile(path.join(home,'results','alpha-pain-map.json'),JSON.stringify(original));
  await fs.writeFile(path.join(home,'results','beta-pain-map.json'),
    JSON.stringify({...original,caseId:'beta'}));
  await fs.writeFile(path.join(home,'results','alpha-uncosted.json'),
    JSON.stringify({source:'yaai-seo-report',generatedAt:'2026-10-12T10:00:00Z',summary:{queries:100}}));
  const one=await createTask({workspaceRoot:home,caseId:'alpha',title:'Study already saved evidence'});
  const two=await createTask({workspaceRoot:home,caseId:'alpha',title:'Save unknown-cost research'});
  const beta=await createTask({workspaceRoot:home,caseId:'beta',title:'Independent client'});
  assert.equal((await readTaskWithArtifact({workspaceRoot:home,id:one.id})).status,'draft');

  const result=await linkSavedArtifact({workspaceRoot:home,id:one.id,
    relativeJsonPath:'results/alpha-pain-map.json'});
  assert.equal(result.status,'result_linked');
  assert.equal(result.events.length,2);
  assert.equal(result.events[0].type,'draft_created');
  assert.equal(result.events[1].type,'artifact_linked');
  assert.equal(result.linkedArtifact.source,'yaai-pain-discovery');
  assert.equal(result.linkedArtifact.measuredCostUsd,0.0031);
  assert.equal(result.linkedArtifact.measuredCostSource,'summary.measuredModelCostUsd');
  assert.match(result.linkedArtifact.sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.policy.executed,false);
  assert.equal(result.policy.paidCallsAuthorized,false);
  assert.equal(result.policy.externalMutationsAuthorized,false);
  assert.equal(result.note.includes('did not execute'),true);
  const savedDraft=JSON.parse(await fs.readFile(path.join(home,'tasks',one.id+'.json')));
  assert.equal(savedDraft.status,'draft','immutable draft must never be rewritten');
  assert.equal(savedDraft.events.length,1);

  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:one.id,
    relativeJsonPath:'results/alpha-pain-map.json'}),{code:'EEXIST'});
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:two.id,
    relativeJsonPath:'results/beta-pain-map.json'}),/does not belong/);
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:two.id,
    relativeJsonPath:'../results/alpha-pain-map.json'}),/JSON must reside/);
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:two.id,
    relativeJsonPath:'.env'}),/JSON must reside/);
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:two.id,
    relativeJsonPath:'results/alpha-../../secrets.json'}),/JSON must reside/);
  await assert.rejects(linkSavedArtifact({workspaceRoot:other,id:one.id,
    relativeJsonPath:'results/alpha-pain-map.json'}),/task not found/);
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:beta.id,
    relativeJsonPath:'results/alpha-pain-map.json'}),/does not belong/);
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:two.id,
    relativeJsonPath:'results/alpha-uncosted.json',origin:'mcp'}),/writes are disabled/);

  const cliLinked=cli(['link','--workspace',home,'--id',two.id,
    '--relative-json','results/alpha-uncosted.json']);
  assert.equal(cliLinked.status,0,cliLinked.stderr);
  const unknown=JSON.parse(cliLinked.stdout);
  assert.equal(unknown.status,'result_linked');
  assert.equal(unknown.linkedArtifact.measuredCostUsd,null,'unknown cost must stay unknown');
  assert.equal(unknown.linkedArtifact.measuredCostSource,null);
  const restarted=cli(['show','--workspace',home,'--id',one.id]);
  assert.equal(restarted.status,0,restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout),result);
  const listed=cli(['list','--workspace',home,'--case','alpha']);
  assert.equal(listed.status,0,listed.stderr);
  const all=JSON.parse(listed.stdout);
  assert.equal(all.total,2);
  assert.ok(all.tasks.every(t=>t.status==='result_linked'));
  assert.equal((await listTasksWithArtifacts({workspaceRoot:home,caseId:'beta'})).tasks[0].status,'draft');

  const symlink=path.join(home,'results','alpha-evil.json');
  await fs.symlink(path.join(home,'results','alpha-pain-map.json'),symlink);
  const newDraft=await createTask({workspaceRoot:home,caseId:'alpha',title:'Reject symbolic source'});
  await assert.rejects(linkSavedArtifact({workspaceRoot:home,id:newDraft.id,
    relativeJsonPath:'results/alpha-evil.json'}),/symlinked source/);

  const eventPath=path.join(home,'tasks','links',one.id+'.json');
  const stat=await fs.lstat(eventPath);
  assert.equal(stat.mode&0o077,0,'private event file');
  await fs.writeFile(path.join(home,'results','alpha-pain-map.json'),
    JSON.stringify({...original,summary:{...original.summary,acceptedEvidence:4}}));
  await assert.rejects(readTaskWithArtifact({workspaceRoot:home,id:one.id}),/linked artifact changed/);
  await assert.rejects(listTasksWithArtifacts({workspaceRoot:home}),/linked artifact changed/);
  // Deliberate file restoration must recover the same record.
  await fs.writeFile(path.join(home,'results','alpha-pain-map.json'),JSON.stringify(original));
  assert.equal((await readTaskWithArtifact({workspaceRoot:home,id:one.id})).status,'result_linked');

  const tampered=JSON.parse(await fs.readFile(eventPath,'utf8'));
  tampered.artifact.measuredCostUsd=0;
  await fs.writeFile(eventPath,JSON.stringify(tampered));
  await assert.rejects(readTaskWithArtifact({workspaceRoot:home,id:one.id}),/linked artifact changed/);
} finally {
  await fs.rm(home,{recursive:true,force:true});
  await fs.rm(other,{recursive:true,force:true});
}
console.log('Task artifact linkage selftest: ok (saved evidence + known/unknown costs, CLI restart, immutable event, cross-client rejection, integrity, zero paid calls)');
