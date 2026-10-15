import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createTask} from '../lib/task-registry.mjs';
import {linkSavedArtifact} from '../lib/task-results.mjs';
import {makeVpsReadonlyServer,readVpsTokenFile,startVpsReadonly} from '../lib/vps-readonly.mjs';
import {createEncryptedBackup,restoreEncryptedBackup} from '../lib/workspace-backup.mjs';

const home=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-vps-safe-'));
const work=path.join(home,'private'),tokenFile=path.join(home,'read-token');
const backupKey=path.join(home,'backup-key'),backupFile=path.join(home,'encrypted.yaai');
const restore=path.join(home,'restored');
const password='correct-'+randomBytes(32).toString('hex');
const read=async(pathname,token,options={})=>fetch(
 'http://127.0.0.1:'+server.address().port+pathname,{
  headers:token===null?{}:{Authorization:'Bearer '+token},
  ...options,
 });
let server;
try {
 await fs.mkdir(path.join(work,'cases'),{recursive:true});
 for(const [id,prefix] of [['client-a','alpha'],['client-b','beta']]){
  await fs.writeFile(path.join(work,'cases',id+'.json'),
    JSON.stringify({id,resultPrefix:prefix,regions:[],seeds:[]}));
 }
 const a=await createTask({workspaceRoot:work,caseId:'client-a',title:'Sensitive research A'});
 const b=await createTask({workspaceRoot:work,caseId:'client-b',title:'Sensitive research B'});
 await fs.mkdir(path.join(work,'results'));
 await fs.writeFile(path.join(work,'results','alpha-map.json'),
   JSON.stringify({source:'cached',caseId:'client-a',text:'confidential A'}));
 await fs.writeFile(path.join(work,'results','beta-map.json'),
   JSON.stringify({source:'cached',caseId:'client-b',text:'confidential B'}));
 await linkSavedArtifact({workspaceRoot:work,id:a.id,
   relativeJsonPath:'results/alpha-map.json'});
 await linkSavedArtifact({workspaceRoot:work,id:b.id,
   relativeJsonPath:'results/beta-map.json'});
 await fs.writeFile(tokenFile,password+'\n',{mode:0o600,flag:'wx'});
 assert.equal(await readVpsTokenFile(tokenFile),password);
 server=makeVpsReadonlyServer({workspaceRoot:work,caseId:'client-a',token:password});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const health=await read('/healthz',null);
 assert.equal(health.status,200);
 assert.deepEqual((await health.json()).ok,true);
 for(const [endpoint,code] of [['/v1/tasks',401],['/v1/info',401],['/v1/tasks/'+a.id,401]]) {
  const r=await read(endpoint,null);
  assert.equal(r.status,code,endpoint);
  assert.equal(r.headers.get('cache-control').includes('no-store'),true);
  assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
 const invalid=await read('/v1/tasks','invalid-token');
 assert.equal(invalid.status,401);
 assert.doesNotMatch(JSON.stringify(await invalid.json()),/confidential|Sensitive/);
 const info=await read('/v1/info',password);
 assert.equal(info.status,200);
 const caps=await info.json();
 assert.equal(caps.caseId,'client-a');
 assert.equal(caps.paidApiCallsAllowed,false);
 assert.equal(caps.writeActionsAllowed,false);
 assert.equal(caps.remoteMcpEnabled,false);
 const list=await read('/v1/tasks',password);
 assert.equal(list.status,200);
 const tasks=await list.json();
 assert.equal(tasks.total,1);
 assert.equal(tasks.tasks[0].id,a.id);
 assert.equal(tasks.tasks[0].title,'Sensitive research A');
 assert.equal(tasks.tasks[0].attemptCount,0);
 assert.match(tasks.tasks[0].sourceSha256,/^[a-f0-9]{64}$/,'linked evidence fingerprint remains visible');
 assert.doesNotMatch(JSON.stringify(tasks),/confidential A|confidential B|Sensitive research B/);
 const signalFeed=await read('/v1/signals',password);
 assert.equal(signalFeed.status,200);
 const inbox=await signalFeed.json();
 assert.equal(inbox.total,1);
 assert.equal(inbox.unread,1);
 assert.equal(inbox.signals[0].taskId,a.id);
 assert.equal(inbox.signals[0].type,'artifact_linked');
 assert.equal(inbox.notificationSent,false);
 assert.doesNotMatch(JSON.stringify(inbox),/confidential A|confidential B|Sensitive research B/);
 assert.equal((await read('/v1/signals',null)).status,401);
 assert.equal((await read('/v1/signals?caseId=client-b',password)).status,404);
 const detail=await read('/v1/tasks/'+a.id,password);
 assert.equal(detail.status,200);
 assert.equal((await detail.json()).task.id,a.id);
 const foreign=await read('/v1/tasks/'+b.id,password);
 assert.equal(foreign.status,404,'cross-case task ID must never be readable');
 for(const endpoint of ['/api/config','/api/batch','/.env','/v1/tasks/../../.env',
  '/v1/tasks/'+a.id+'?caseId=client-b']){
  const r=await read(endpoint,password);
  assert.equal(r.status,404,endpoint);
 }
 const post=await read('/v1/tasks',password,{method:'POST'});
 assert.equal(post.status,405);
 const body=await read('/v1/tasks',password,{method:'POST',body:'{}'});
 assert.equal(body.status,405,'all write methods must be rejected consistently');
 assert.equal((await read('/healthz?private=1',null)).status,401);
 await new Promise(resolve=>server.close(resolve));
 server=null;
 // Startup refuses missing case, weak token, or publicly accessible token file.
 await assert.rejects(startVpsReadonly({workspaceRoot:work,caseId:'missing',
   tokenFile,port:0}),/ENOENT|case/);
 assert.throws(()=>makeVpsReadonlyServer({workspaceRoot:work,caseId:'client-a',
   token:'short'}),/read token must/);
 await fs.chmod(tokenFile,0o644);
 await assert.rejects(readVpsTokenFile(tokenFile),/group\/others/);
 await fs.chmod(tokenFile,0o600);
 const link=path.join(home,'linked-token');
 await fs.symlink(tokenFile,link);
 await assert.rejects(readVpsTokenFile(link),/unsafe read-token file/);

 // Encrypted backup excludes integrations and any secret file, supports
 // recovery of both client cases and task records into an ABSENT folder.
 await fs.writeFile(backupKey,randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'});
 await fs.mkdir(path.join(work,'integrations'));
 await fs.writeFile(path.join(work,'integrations','private-token'),
   'NEVER-ARCHIVE-THIS-SENSITIVE-KEY');
 const created=await createEncryptedBackup({
   workspaceRoot:work,outputFile:backupFile,keyFile:backupKey,
 });
 assert.equal(created.encrypted,true);
 assert.ok(created.fileCount>=4);
 const ciphertext=await fs.readFile(backupFile,'utf8');
 assert.doesNotMatch(ciphertext,/Sensitive research A|confidential A|NEVER-ARCHIVE/);
 assert.equal((await fs.stat(backupFile)).mode&0o077,0);
 const verified=await restoreEncryptedBackup({
   inputFile:backupFile,destinationRoot:restore,keyFile:backupKey,verifyOnly:true,
 });
 assert.equal(verified.verified,true);
 assert.equal(verified.filesWritten,0);
 await assert.rejects(fs.stat(restore),{code:'ENOENT'});
 const restored=await restoreEncryptedBackup({
   inputFile:backupFile,destinationRoot:restore,keyFile:backupKey,
 });
 assert.equal(restored.fileCount,created.fileCount);
 assert.equal(JSON.parse(await fs.readFile(path.join(restore,'cases','client-a.json'),'utf8')).id,'client-a');
 assert.equal(JSON.parse(await fs.readFile(path.join(restore,'tasks',a.id+'.json'),'utf8')).caseId,'client-a');
 assert.equal((await fs.readFile(path.join(restore,'results','alpha-map.json'),'utf8')).includes('confidential A'),true);
 await assert.rejects(fs.stat(path.join(restore,'integrations','private-token')),{code:'ENOENT'});
 await assert.rejects(restoreEncryptedBackup({inputFile:backupFile,
  destinationRoot:restore,keyFile:backupKey}),/restore target must be new/);
 await assert.rejects(createEncryptedBackup({workspaceRoot:work,
  outputFile:backupFile,keyFile:backupKey}),/already exists/);
 const wrong=path.join(home,'wrong-key');
 await fs.writeFile(wrong,randomBytes(32).toString('hex'),{mode:0o600});
 await assert.rejects(restoreEncryptedBackup({inputFile:backupFile,
  destinationRoot:path.join(home,'wrong-destination'),keyFile:wrong}),/backup authentication failed/);
 const tamperedPath=path.join(home,'tampered.yaai');
 const tampered=JSON.parse(ciphertext);
 tampered.ciphertext=tampered.ciphertext.slice(0,-5)+'AAAAA';
 await fs.writeFile(tamperedPath,JSON.stringify(tampered));
 await assert.rejects(restoreEncryptedBackup({inputFile:tamperedPath,
  destinationRoot:path.join(home,'tamper-restored'),keyFile:backupKey}),
  /backup authentication failed|invalid decrypted manifest/);
 await assert.rejects(fs.stat(path.join(home,'tamper-restored')),{code:'ENOENT'});
 // Rejected key file with unsafe permissions cannot silently decrypt backups.
 await fs.chmod(backupKey,0o644);
 await assert.rejects(createEncryptedBackup({workspaceRoot:work,
  outputFile:path.join(home,'new.yaai'),keyFile:backupKey}),/owner-only/);
 await fs.chmod(backupKey,0o600);
 const symlink=path.join(work,'results','alpha-evil.json');
 await fs.symlink(path.join(work,'results','alpha-map.json'),symlink);
 await assert.rejects(createEncryptedBackup({workspaceRoot:work,
  outputFile:path.join(home,'symlink.yaai'),keyFile:backupKey}),/symbolic links/);
 console.log('VPS read-only and encrypted backup selftest: ok (case isolation, auth, method gates, encryption, restore, zero API calls)');
} finally {
 if(server)await new Promise(resolve=>server.close(resolve));
 await fs.rm(home,{recursive:true,force:true});
}
