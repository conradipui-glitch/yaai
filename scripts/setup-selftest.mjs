import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setupWorkspace,inspectSetup,setupLocations} from '../lib/setup.mjs';
import {ENGINE_ROOT} from '../lib/workspace.mjs';
import {createTask} from '../lib/task-registry.mjs';
import {TOOLS,createMcpContext,handleRpcMessage} from '../mcp-server.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-setup-'));
const location=path.join(temp,'clients','alpha','research');
const other=path.join(temp,'clients','beta','research');
const config={workspaceRoot:location,mode:'local',caseId:'roof-omsk',
  projectName:'Кровельные услуги — Омск',resultPrefix:'roof'};
const env={...process.env,OPENROUTER_API_KEY:'',YAIS_AI:'',YANDEX_API_KEY:'',YAAI_WORKSPACE:''};
const cli=args=>spawnSync(process.execPath,['scripts/setup.mjs',...args],{
  cwd:ENGINE_ROOT,encoding:'utf8',env,
});
const options=(root,mode='local')=>['--mode',mode,'--workspace',root,
  '--case','roof-omsk','--prefix','roof','--name','Кровельные услуги — Омск'];
const fileExists=async file=>!!await fs.lstat(file).catch(e=>{
  if(e.code==='ENOENT')return null;throw e;
});
try{
  const preview=await setupWorkspace({...config,dryRun:true});
  assert.equal(preview.paidRequests,0);
  assert.equal(preview.llmApiRequired,false);
  assert.equal(preview.wouldCreate.length,3);
  assert.equal(await fileExists(location),false,'dry-run must not create the workspace');
  const missing=cli(['--check',...options(location)]);
  assert.equal(missing.status,1);
  assert.equal(JSON.parse(missing.stdout).ready,false);
  assert.equal(await fileExists(location),false,'doctor must not mutate files');

  const actual=await setupWorkspace(config);
  assert.equal(actual.createdFiles.length,3);
  assert.equal(actual.dryRun,false);
  assert.equal(actual.mode,'local');
  for(const file of actual.createdFiles)assert.ok(await fileExists(file));
  for(const folder of ['cases','presets','planners','results','snapshots','inputs','tasks','integrations']){
    assert.ok((await fs.stat(path.join(location,folder))).isDirectory(),folder);
  }
  const caseFile=path.join(location,'cases','roof-omsk.json');
  const presetFile=path.join(location,'presets','roof.json');
  const plannerFile=path.join(location,'planners','roof.json');
  const caseData=JSON.parse(await fs.readFile(caseFile));
  const preset=JSON.parse(await fs.readFile(presetFile));
  const planner=JSON.parse(await fs.readFile(plannerFile));
  assert.equal(caseData.id,'roof-omsk');
  assert.equal(caseData.resultPrefix,'roof');
  assert.equal(caseData.name,'Кровельные услуги — Омск');
  assert.deepEqual(caseData.seeds,[]);
  assert.deepEqual(caseData.regions,[]);
  assert.deepEqual(preset.intents,[]);
  assert.deepEqual(preset.negativeKeywords,[]);
  assert.deepEqual(planner.targets,[]);
  assert.equal((await fs.stat(caseFile)).mode&0o077,0,'private config permissions on Linux');
  const check=await inspectSetup(config);
  assert.equal(check.ready,true);
  assert.equal(check.inputsConfigured,false,'blank inputs are not real research');
  assert.equal(check.paidRequests,0);
  assert.equal(check.checkedWithoutNetwork,true);
  const cliCheck=cli(['--check',...options(location)]);
  assert.equal(cliCheck.status,0,cliCheck.stderr);
  assert.equal(JSON.parse(cliCheck.stdout).ready,true);
  const idempotent=await setupWorkspace(config);
  assert.equal(idempotent.createdFiles.length,0);
  assert.equal(idempotent.reusedFiles.length,3);
  // Never overwrite a client-edited case, keywords or planner.
  const customized={...caseData,regions:['Омск'],seeds:['ремонт кровли']};
  await fs.writeFile(caseFile,JSON.stringify(customized));
  await fs.writeFile(presetFile,JSON.stringify({...preset,
    queryClassification:{...preset.queryClassification,commercialKeywords:['купить']}}));
  assert.equal((await setupWorkspace(config)).createdFiles.length,0);
  assert.deepEqual(JSON.parse(await fs.readFile(caseFile)),customized);
  await assert.rejects(setupWorkspace({...config,resultPrefix:'another'}),/different ID\/prefix/);
  await assert.rejects(setupWorkspace({...config,mode:'cloud'}),/mode must/);

  const harness=await setupWorkspace({...config,mode:'harness'});
  assert.equal(harness.createdFiles.length,1,'only MCP config added');
  const privateMcp=path.join(location,'integrations','mcp.local.json');
  const mcp=JSON.parse(await fs.readFile(privateMcp));
  assert.equal(mcp.mcpServers.yaai.command,process.execPath);
  assert.deepEqual(mcp.mcpServers.yaai.args,[
    path.join(ENGINE_ROOT,'mcp-server.mjs'),'--workspace',location,
    '--case','roof-omsk',
  ]);
  assert.equal((await inspectSetup({...config,mode:'harness'})).ready,true);
  const harnessAgain=cli(options(location,'harness'));
  assert.equal(harnessAgain.status,0,harnessAgain.stderr);
  assert.equal(JSON.parse(harnessAgain.stdout).createdFiles.length,0);
  assert.equal(await fileExists(path.join(location,'.env')),false);
  assert.equal(await fileExists(path.join(location,'credentials.json')),false);
  assert.ok(!JSON.stringify(mcp).includes('OPENROUTER_API_KEY'));
  await assert.rejects(setupWorkspace({...config,mode:'harness',workspaceRoot:other,
    caseId:'../oops'}),/Invalid case id/);

  // Workspace opened by the existing MCP sees the same case immediately;
  // no provider credentials, no general-purpose LLM required.
  const context=createMcpContext({workspaceRoot:location,caseId:'roof-omsk'});
  const state={};
  const rpc=await handleRpcMessage({
    jsonrpc:'2.0',id:5,method:'tools/call',
    params:{name:'yaai_workspace_overview',arguments:{caseId:'roof-omsk'}},
  },state,context);
  assert.ok(!rpc.error,JSON.stringify(rpc.error));
  const structured=rpc.result?.structuredContent||JSON.parse(rpc.result.content?.[0]?.text||'{}');
  assert.equal(structured.selectedCase.id,'roof-omsk');
  assert.equal(structured.capabilities.paidApiCallsFromMcp,false);
  assert.ok(TOOLS.some(x=>x.name==='yaai_tasks'));
  const task=await createTask({workspaceRoot:location,caseId:'roof-omsk',
    title:'First offline task after setup'});
  assert.equal(task.status,'draft');

  const cliDry=cli(['--dry-run',...options(other,'harness')]);
  assert.equal(cliDry.status,0,cliDry.stderr);
  assert.equal(JSON.parse(cliDry.stdout).dryRun,true);
  assert.equal(await fileExists(other),false);
  const createOther=cli(options(other,'harness'));
  assert.equal(createOther.status,0,createOther.stderr);
  assert.equal((await inspectSetup({...config,workspaceRoot:other,mode:'harness'})).ready,true);
  assert.equal(await fileExists(path.join(other,'tasks',task.id+'.json')),false,
    'never share task records between client workspaces');

  // A second case cannot re-use the same result-prefix in the same workspace.
  await assert.rejects(setupWorkspace({
    workspaceRoot:location,caseId:'second',resultPrefix:'roof',mode:'local',
  }),/another case already uses resultPrefix/);
  await assert.rejects(setupWorkspace({...config,workspaceRoot:ENGINE_ROOT}),
    /OUTSIDE the public engine checkout/);
  await assert.rejects(setupWorkspace({...config,workspaceRoot:path.join(ENGINE_ROOT,'data')}),
    /OUTSIDE the public engine checkout/);
  const linked=path.join(temp,'unsafe-link');
  await fs.symlink(location,linked);
  await assert.rejects(setupWorkspace({...config,workspaceRoot:linked}),
    /symlink or non-directory/);

  // Corrupt or altered existing configuration refuses to overwrite user data.
  const edited=JSON.parse(await fs.readFile(privateMcp));
  edited.mcpServers.yaai.args[0]='/tmp/attacker.mjs';
  await fs.writeFile(privateMcp,JSON.stringify(edited));
  await assert.rejects(setupWorkspace({...config,mode:'harness'}),
    /MCP config differs/);
  assert.equal(JSON.parse(await fs.readFile(privateMcp)).mcpServers.yaai.args[0],
    '/tmp/attacker.mjs','do not overwrite a modified connector');
  const noImplicit=cli(['--mode','local','--case','roof-omsk']);
  assert.notEqual(noImplicit.status,0);
  assert.match(noImplicit.stderr,/Non-interactive mode requires/);
}finally{
  await fs.rm(temp,{recursive:true,force:true});
}
console.log('YA AI setup selftest: ok (fresh installation, MCP compatibility, dry-run, doctor, client isolation, idempotence, no paid API)');
