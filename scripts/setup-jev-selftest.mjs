import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {setupWorkspace,inspectSetup} from '../lib/setup.mjs';
import {readJevProfile,resolveProjectJevSelection} from '../lib/setup-jev.mjs';

const base=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-jev-wizard-'));
const work=path.join(base,'private-client-research');
const separate=path.join(base,'separate-workspace');
const env={...process.env,YAIS_AI:'',OPENROUTER_API_KEY:'',
 YAAI_JEV_PROVIDER:'',YAAI_JEV_MODEL:'',TYPESAFE_API_KEY:'',
 YAAI_TYPESAFE_API_KEY:'',YANDEX_API_KEY:''};
const run=(file,args,changes={})=>spawnSync(process.execPath,[file,...args],{
 cwd:path.resolve('.'),encoding:'utf8',env:{...env,...changes},
});
const opt=(id,prefix)=>['--mode','harness','--workspace',work,
 '--case',id,'--prefix',prefix];
const doctor=(id,extra=[],envChanges={})=>run('scripts/jev-provider.mjs',
 ['--workspace',work,'--case',id,...extra],envChanges);
try {
 const plan=await setupWorkspace({mode:'harness',workspaceRoot:work,
   caseId:'client-a',resultPrefix:'alpha',jevProvider:'typesafe',dryRun:true});
 assert.equal(plan.jev.provider,'typesafe');
 assert.equal(plan.jev.model,'jev-1.13.0');
 assert.equal(plan.jev.credentialEnvVar,'TYPESAFE_API_KEY');
 assert.equal(plan.jev.credentialPresent,false);
 assert.equal(plan.wouldCreate.length,5);
 await assert.rejects(fs.lstat(work),{code:'ENOENT'});
 const cliPreview=run('scripts/setup.mjs',
  ['--dry-run',...opt('client-a','alpha'),'--jev-provider','typesafe']);
 assert.equal(cliPreview.status,0,cliPreview.stderr);
 assert.equal(JSON.parse(cliPreview.stdout).jev.provider,'typesafe');
 await assert.rejects(fs.lstat(work),{code:'ENOENT'});

 const a=run('scripts/setup.mjs',[...opt('client-a','alpha'),
  '--jev-provider','typesafe']);
 assert.equal(a.status,0,a.stderr);
 const created=JSON.parse(a.stdout);
 assert.equal(created.createdFiles.length,5);
 assert.equal(created.jev.model,'jev-1.13.0');
 const apath=path.join(work,'integrations','jev.client-a.json');
 const storedA=JSON.parse(await fs.readFile(apath,'utf8'));
 assert.deepEqual(storedA,{schemaVersion:1,caseId:'client-a',
   provider:'typesafe',model:'jev-1.13.0',credentialEnvVar:'TYPESAFE_API_KEY'});
 assert.equal((await fs.stat(apath)).mode&0o077,0);
 assert.equal(JSON.stringify(storedA).includes('secret'),false);
 assert.equal((await inspectSetup({workspaceRoot:work,caseId:'client-a',
    resultPrefix:'alpha',mode:'harness'})).ready,true);
 const bareAgain=run('scripts/setup.mjs',opt('client-a','alpha'));
 assert.equal(bareAgain.status,0,bareAgain.stderr);
 assert.equal(JSON.parse(bareAgain.stdout).createdFiles.length,0);
 assert.equal(JSON.parse(bareAgain.stdout).jev.provider,'typesafe');
 assert.deepEqual(JSON.parse(await fs.readFile(apath)),storedA);

 const b=run('scripts/setup.mjs',[...opt('client-b','beta'),
  '--jev-provider','openrouter','--jev-key-env','OPENROUTER_API_KEY']);
 assert.equal(b.status,0,b.stderr);
 assert.equal(JSON.parse(b.stdout).jev.provider,'openrouter');
 const storedB=JSON.parse(await fs.readFile(path.join(work,'integrations','jev.client-b.json')));
 assert.equal(storedB.credentialEnvVar,'OPENROUTER_API_KEY');
 assert.equal((await readJevProfile({workspaceRoot:work,caseId:'client-a'})).provider,'typesafe');
 assert.equal((await readJevProfile({workspaceRoot:work,caseId:'client-b'})).provider,'openrouter');

 const diag=doctor('client-a',[],{TYPESAFE_API_KEY:'secret-test-A'});
 assert.equal(diag.status,0,diag.stderr);
 assert.equal(JSON.parse(diag.stdout).model,'jev-1.13.0');
 assert.equal(JSON.parse(diag.stdout).caseId,'client-a');
 assert.equal(JSON.parse(diag.stdout).credentialPresent,true);
 assert.deepEqual(JSON.parse(diag.stdout).credentialEnvironmentVariables,['TYPESAFE_API_KEY']);
 assert.equal(JSON.parse(diag.stdout).keyValidatedByProvider,false);
 assert.equal(JSON.parse(diag.stdout).networkCalled,false);
 assert.equal(JSON.parse(diag.stdout).paidRequests,0);
 assert.doesNotMatch(diag.stdout,/secret-test-A/);
 const selected=await resolveProjectJevSelection({
   workspaceRoot:work,caseId:'client-b',env:{
     OPENROUTER_API_KEY:'test-b',
     YAIS_AI:'unrelated-a',
   },
 });
 assert.equal(selected.profile.provider,'openrouter');
 assert.equal(selected.apiKey,'test-b','case selection uses ONLY named environment variable');
 assert.equal(selected.diagnostic.credentialVerified,false);
 assert.equal(selected.diagnostic.networkCalled,false);

 const noWrongEnv=doctor('client-b',['--require-key'],{YAIS_AI:'wrong-fallback'});
 assert.equal(noWrongEnv.status,1,'wrong environment alias must not satisfy saved configuration');
 const correctEnv=doctor('client-b',['--require-key'],{OPENROUTER_API_KEY:'secret-test-B'});
 assert.equal(correctEnv.status,0,correctEnv.stderr);
 assert.doesNotMatch(correctEnv.stdout,/secret-test-B/);
 const mismatch=doctor('client-a',['--provider','openrouter']);
 assert.notEqual(mismatch.status,0);
 assert.match(mismatch.stderr,/conflicts with saved case profile/);
 const modelMismatch=doctor('client-a',['--model','jev-new-version']);
 assert.notEqual(modelMismatch.status,0);
 assert.match(modelMismatch.stderr,/conflicts with saved case profile/);
 const incomplete=run('scripts/jev-provider.mjs',['--workspace',work]);
 assert.notEqual(incomplete.status,0);
 assert.match(incomplete.stderr,/provide BOTH/);

 const noExecute=run('scripts/jev-evaluate.mjs',
   ['--workspace',work,'--case','client-a','--input','missing.json']);
 assert.notEqual(noExecute.status,0);
 assert.match(noExecute.stderr,/Add --execute explicitly/);

 const changed=run('scripts/setup.mjs',
   [...opt('client-a','alpha'),'--jev-provider','openrouter']);
 assert.notEqual(changed.status,0);
 assert.match(changed.stderr,/no silent overwrite/);
 assert.deepEqual(JSON.parse(await fs.readFile(apath)),storedA);
 const badEnv=run('scripts/setup.mjs',
   [...opt('client-a','alpha'),'--jev-key-env','secret-test-A']);
 assert.notEqual(badEnv.status,0);
 assert.match(badEnv.stderr,/ENVIRONMENT VARIABLE NAME/);
 assert.doesNotMatch(badEnv.stderr,/secret-test-A/);

 // Invalid JSON with unexpected fields (e.g. accidental API key) is rejected
 // before it can become an accepted profile or be overwritten by setup.
 const raw=await fs.readFile(apath);
 await fs.writeFile(apath,JSON.stringify({...storedA,apiKey:'secret-test-A'}));
 await assert.rejects(readJevProfile({workspaceRoot:work,caseId:'client-a'}),/no secrets may be saved/);
 await assert.rejects(setupWorkspace({workspaceRoot:work,caseId:'client-a',
   resultPrefix:'alpha',mode:'harness'}),/no secrets may be saved/);
 await fs.writeFile(apath,raw);
 assert.equal((await readJevProfile({workspaceRoot:work,caseId:'client-a'})).provider,'typesafe');

 const symlink=path.join(work,'integrations','jev.client-a.json');
 await fs.rename(symlink,symlink+'.saved');
 await fs.symlink(symlink+'.saved',symlink);
 await assert.rejects(readJevProfile({workspaceRoot:work,caseId:'client-a'}),/unsafe or oversized/);
 await fs.unlink(symlink);
 await fs.rename(symlink+'.saved',symlink);

 // An old installation without a profile is detected, then safely repaired
 // by rerunning setup, with its case and user data unchanged.
 const c=run('scripts/setup.mjs',opt('client-c','gamma'));
 assert.equal(c.status,0,c.stderr);
 const cPath=path.join(work,'integrations','jev.client-c.json');
 const caseC=path.join(work,'cases','client-c.json');
 const savedCase=await fs.readFile(caseC);
 await fs.unlink(cPath);
 const missing=run('scripts/setup.mjs',['--check',...opt('client-c','gamma')]);
 assert.equal(missing.status,1);
 assert.equal(JSON.parse(missing.stdout).ready,false);
 assert.equal(JSON.parse(missing.stdout).jev,null);
 assert.equal(await fs.readFile(caseC,'utf8'),savedCase.toString());
 const repaired=run('scripts/setup.mjs',opt('client-c','gamma'));
 assert.equal(repaired.status,0,repaired.stderr);
 assert.equal(JSON.parse(repaired.stdout).createdFiles.length,1);
 assert.equal((await readJevProfile({workspaceRoot:work,caseId:'client-c'})).provider,'openrouter');
 assert.equal(await fs.readFile(caseC,'utf8'),savedCase.toString());

 // Two separate workspaces cannot see each other's provider profile.
 assert.equal(await readJevProfile({workspaceRoot:separate,caseId:'client-a'}),null);
}finally{
 await fs.rm(base,{recursive:true,force:true});
}
console.log('YA AI Jev setup selftest: ok (independent case providers, offline doctor, secret isolation, idempotence, no paid calls)');
