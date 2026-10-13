import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {readTaskWithArtifact,listTasksWithArtifacts} from './task-results.mjs';
import {safeConfigId} from './workspace.mjs';
import {analyzeWebmasterCsv} from './webmaster-overlap.mjs';

// v1 is intentionally NOT a scheduler or arbitrary shell runner.
// It only executes an already implemented local CSV -> JSON analysis.
export const OFFLINE_JOB='webmaster-overlap';
const MAX_SOURCE_BYTES=3*1024*1024;
const MAX_ATTEMPTS=3;
const sha256=data=>createHash('sha256').update(data).digest('hex');
const fail=message=>{throw Error('YA AI offline job: '+message);};
const rootOf=value=>{if(typeof value!=='string'||!value.trim())fail('explicit workspace required');return path.resolve(value);};
const assertDir=async dir=>{
  const st=await fs.lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink())fail('unsafe job directory: '+dir);
};
const assertFile=async (file,max)=>{
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>max)
    fail('unsafe or oversized job file');
  return st;
};
const executionBase=(root,id)=>path.join(root,'tasks','executions',id);
const attemptName=n=>String(n).padStart(3,'0');
const eventFile=(base,n,phase)=>path.join(base,attemptName(n)+'-'+phase+'.json');
const lockDir=base=>path.join(base,'.lock');
const lockOwner=base=>path.join(lockDir(base),'owner.json');
const parse=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const exists=async file=>{try {return await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const checkedRead=async (file,max=MAX_SOURCE_BYTES)=>{
  await assertFile(file,max);
  const raw=await fs.readFile(file);
  if(raw.length>max)fail('source too large');
  return raw;
};
const idPattern=/^task-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const boundedNumber=n=>Number.isSafeInteger(n)&&n>=1&&n<=MAX_ATTEMPTS;
const sourcePath=async (root,caseId)=>{
  const dir=path.join(root,'inputs');
  await assertDir(dir);
  const folder=path.join(dir,caseId);
  await assertDir(folder);
  const file=path.join(folder,'webmaster.csv');
  await assertFile(file,MAX_SOURCE_BYTES);
  return file;
};
const caseConfig=async(root,caseId)=>{
  const dir=path.join(root,'cases');await assertDir(dir);
  const filename=path.join(dir,caseId+'.json');
  await assertFile(filename,64*1024);
  const data=await parse(filename);
  if(data?.id!==caseId)fail('case config ID mismatch');
  return data;
};
async function storage(root,id,{create=false}={}){
  if(!idPattern.test(id))fail('invalid task ID');
  const tasks=path.join(root,'tasks'),executions=path.join(tasks,'executions');
  await assertDir(root);await assertDir(tasks);
  if(create){
    await fs.mkdir(executions,{mode:0o700,recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    await assertDir(executions);
    await fs.mkdir(executionBase(root,id),{mode:0o700,recursive:false})
      .catch(e=>{if(e.code!=='EEXIST')throw e;});
  }
  if(!await exists(executions))return null;
  await assertDir(executions);
  const base=executionBase(root,id);
  if(!await exists(base))return null;
  await assertDir(base);
  return base;
}
const checkedEvent=async(file,taskId,n,phase)=>{
  const data=await parse(file);
  if(data?.schemaVersion!==1||data?.taskId!==taskId||data?.attempt!==n ||
     data?.phase!==phase||typeof data?.at!=='string'||
     !Number.isFinite(Date.parse(data.at)))fail('corrupted job event: '+file);
  if(phase==='start'){
    if(data.job!==OFFLINE_JOB||data.mode!=='offline'||data.origin!=='cli')
      fail('invalid start event');
  }else if(phase==='end'){
    if(!['succeeded','failed'].includes(data.status))fail('invalid end status');
    if(data.status==='succeeded'){
      if(!/^results\/[a-z0-9._-]+\.json$/i.test(data.output?.path)||
         !/^[a-f0-9]{64}$/.test(data.output?.sha256)||
         !/^[a-f0-9]{64}$/.test(data.input?.sha256)||
         data.output?.source!==OFFLINE_JOB)fail('invalid recorded output fingerprint');
    }else if(!['INPUT_UNAVAILABLE','INPUT_INVALID','OUTPUT_UNAVAILABLE','EXECUTION_FAILED']
      .includes(data.errorCode))fail('invalid recorded failure reason');
  }
  return data;
};
async function loadAttempts(root,taskId) {
  const base=await storage(root,taskId);
  if(!base)return [];
  const names=(await fs.readdir(base)).filter(x=>/^\d{3}-(start|end)\.json$/.test(x));
  const indices=[...new Set(names.map(x=>Number(x.slice(0,3))))].sort((a,b)=>a-b);
  if(indices.some((n,i)=>n!==i+1||!boundedNumber(n)))fail('nonconsecutive or excessive attempts');
  const entries=[];
  for(const n of indices){
    const startPath=eventFile(base,n,'start');
    if(!await exists(startPath))fail('end exists without start');
    await assertFile(startPath,64*1024);
    const start=await checkedEvent(startPath,taskId,n,'start');
    const endPath=eventFile(base,n,'end');
    let end=null;
    if(await exists(endPath)){
      await assertFile(endPath,64*1024);
      end=await checkedEvent(endPath,taskId,n,'end');
      if(end.status==='succeeded'){
        const output=path.join(root,end.output.path);
        await assertDir(path.join(root,'results'));
        const raw=await checkedRead(output,MAX_SOURCE_BYTES);
        if(sha256(raw)!==end.output.sha256)fail('completed output changed: '+taskId);
        const obj=JSON.parse(raw.toString('utf8'));
        if(obj?.source!=='yaai-webmaster-overlap-task'||obj?.caseId!==start.caseId||
           obj?.taskId!==taskId||obj?.runAttempt!==n)fail('completed output metadata mismatch');
      }
    }
    entries.push({attempt:n,start,end});
  }
  return entries;
}
async function liveOwner(base) {
  const lock=lockDir(base);
  if(!await exists(lock))return null;
  await assertDir(lock);
  const file=lockOwner(base);
  if(!await exists(file))fail('incomplete lock: investigate before retry');
  await assertFile(file,16*1024);
  const owner=await parse(file);
  if(!Number.isInteger(owner.pid)||owner.pid<1||owner.hostname!==os.hostname()||
      typeof owner.taskId!=='string')fail('unknown lock owner; use same host or investigate');
  let alive=true;
  try{process.kill(owner.pid,0);}
  catch(e){if(e.code==='ESRCH')alive=false;else if(e.code!=='EPERM')throw e;}
  return {owner,alive};
}
async function statusOf(root,task){
  const attempts=await loadAttempts(root,task.id);
  if(!attempts.length)return null;
  const last=attempts.at(-1),base=executionBase(root,task.id);
  if(last.start.caseId!==task.caseId)fail('task/case changed');
  const lock=await liveOwner(base);
  if(lock&&lock.owner.taskId!==task.id)fail('lock task ID mismatch');
  const status=last.end?.status || (lock?.alive?'running':'interrupted');
  return {
    job:OFFLINE_JOB,status,attempts:attempts.length,
    lastAttempt:last.attempt,
    startedAt:last.start.at,endedAt:last.end?.at||null,
    input:last.end?.input||null,output:last.end?.output||null,
    errorCode:last.end?.errorCode||null,
    attemptedLocally:true,billableCallsAuthorized:false,billableCallsMadeByThisJob:0,
    externalMutationsMade:false,
    note:status==='interrupted'
      ? 'No end event: a prior process may have stopped. Use explicit recover if its lock is stale, then explicit retry.'
      : 'Only existing CSV analysis; no network, model, scheduler or ad mutations.',
  };
}
export async function readTaskWithExecution({workspaceRoot,id}={}){
  const root=rootOf(workspaceRoot);
  const task=await readTaskWithArtifact({workspaceRoot:root,id});
  const execution=await statusOf(root,task);
  if(!execution)return task;
  if(task.status==='result_linked')fail('task cannot have both a pre-existing result link and a run journal');
  return {...task,status:execution.status,
    updatedAt:execution.endedAt||execution.startedAt,
    execution,events:[...task.events,...await (async()=>{
      const runs=await loadAttempts(root,task.id);
      return runs.flatMap(r=>[
        {type:'run_started',at:r.start.at,attempt:r.attempt},
        ...(r.end?[{type:'run_'+r.end.status,at:r.end.at,attempt:r.attempt}]:[]),
      ]);
    })()],
  };
}
export async function listTasksWithExecution({workspaceRoot,caseId,limit=30}={}){
  if(!Number.isInteger(limit)||limit<1||limit>200)fail('limit must be 1–200');
  const root=rootOf(workspaceRoot);
  const raw=await listTasksWithArtifacts({workspaceRoot:root,caseId,limit:200});
  if(raw.omitted)fail('workspace contains more than 200 tasks; use explicit task ID');
  const tasks=await Promise.all(raw.tasks.map(x=>readTaskWithExecution({workspaceRoot:root,id:x.id})));
  return {total:tasks.length,tasks:tasks.slice(0,limit),omitted:Math.max(0,tasks.length-limit)};
}
const writeExclusive=async (filename,data)=>{
  const tmp=filename+'.'+randomUUID()+'.tmp';
  try{
    await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
    await fs.link(tmp,filename); // No replacement, even across processes.
  }finally{await fs.rm(tmp,{force:true});}
};
async function cleanupLock(base){
  await fs.rm(lockOwner(base),{force:true});
  await fs.rmdir(lockDir(base));
}
export async function recoverInterruptedTask({workspaceRoot,id}={}){
  const root=rootOf(workspaceRoot);
  const task=await readTaskWithArtifact({workspaceRoot:root,id});
  const base=await storage(root,task.id);
  if(!base)fail('no run to recover');
  const attempts=await loadAttempts(root,task.id);
  if(!attempts.length||attempts.at(-1).end)fail('only interrupted attempts may be recovered');
  const lock=await liveOwner(base);
  if(lock?.alive)fail('worker is still alive; refusing to clear its lock');
  if(lock)await cleanupLock(base);
  return readTaskWithExecution({workspaceRoot:root,id:task.id});
}
export async function runOfflineTask({workspaceRoot,id,mode='run'}={}){
  if(!['run','retry'].includes(mode))fail('supported modes are run and retry only');
  const root=rootOf(workspaceRoot);
  const task=await readTaskWithArtifact({workspaceRoot:root,id});
  if(task.kind!=='research')fail('offline Webmaster overlap requires a research task');
  if(task.status==='result_linked')fail('cannot execute a task with an already linked prior result');
  const caseId=safeConfigId(task.caseId,'case');
  const config=await caseConfig(root,caseId);
  const prefix=safeConfigId(config.resultPrefix,'result prefix');
  const base=await storage(root,task.id,{create:true});
  // Exclusive per-task lock to prevent concurrent starts and result races.
  try{await fs.mkdir(lockDir(base),{mode:0o700});}
  catch(e){if(e.code==='EEXIST')fail('job locked; check process or call recover after it exits');throw e;}
  let lockReady=false,attemptStarted=false,n=0;
  try{
    await fs.writeFile(lockOwner(base),JSON.stringify({
      taskId:task.id,pid:process.pid,hostname:os.hostname(),createdAt:new Date().toISOString(),
    }),{flag:'wx',mode:0o600});
    lockReady=true;
    const prior=await loadAttempts(root,task.id);
    if(mode==='run'&&prior.length)fail('already started; use explicit retry for failed or interrupted work');
    if(mode==='retry'&&(!prior.length||prior.at(-1).end?.status==='succeeded'))
      fail('no failed/interrupted attempt to retry');
    if(prior.length>=MAX_ATTEMPTS)fail('attempt limit reached');
    n=prior.length+1;
    await writeExclusive(eventFile(base,n,'start'),{
      schemaVersion:1,taskId:task.id,caseId,job:OFFLINE_JOB,mode:'offline',
      origin:'cli',phase:'start',attempt:n,at:new Date().toISOString(),
    });
    attemptStarted=true;
    let outcome,stage='input';
    try{
      const filename=await sourcePath(root,caseId);
      const csv=await checkedRead(filename);
      stage='analysis';
      const analysis=analyzeWebmasterCsv(csv.toString('utf8'));
      stage='output';
      const filenameOut=prefix+'-webmaster-overlap-'+task.id+'-a'+n+'.json';
      const relative='results/'+filenameOut;
      const output={
        schemaVersion:1,source:'yaai-webmaster-overlap-task',caseId,
        taskId:task.id,runAttempt:n,generatedAt:new Date().toISOString(),
        input:{relativePath:'inputs/'+caseId+'/webmaster.csv',
          sha256:sha256(csv),sizeBytes:csv.length},
        summary:{inputRows:analysis.inputRows,candidateCount:analysis.candidateCount,
          measuredCostUsd:null},
        ...analysis,
      };
      const results=path.join(root,'results');
      if(!await exists(results))await fs.mkdir(results,{mode:0o700});
      await assertDir(results);
      const dest=path.join(results,filenameOut);
      await writeExclusive(dest,output);
      const outRaw=await checkedRead(dest);
      outcome={status:'succeeded',input:output.input,
        output:{path:relative,sha256:sha256(outRaw),source:OFFLINE_JOB},
        stats:{rows:analysis.inputRows,candidates:analysis.candidateCount}};
    }catch(error){
      // Never persist raw error messages, which might include client data.
      outcome={status:'failed',
        errorCode:stage==='input'&&error?.code==='ENOENT'?'INPUT_UNAVAILABLE':
          stage==='input'||stage==='analysis'?'INPUT_INVALID':
          stage==='output'?'OUTPUT_UNAVAILABLE':'EXECUTION_FAILED'};
    }
    await writeExclusive(eventFile(base,n,'end'),{
      schemaVersion:1,taskId:task.id,attempt:n,phase:'end',
      at:new Date().toISOString(),...outcome,
    });
    return await readTaskWithExecution({workspaceRoot:root,id:task.id});
  }finally{
    // An unexpected crash leaves a lock and start event for explicit recovery;
    // a synchronous error before start still removes our own lock.
    if(lockReady)await cleanupLock(base);
    else if(!attemptStarted)await fs.rmdir(lockDir(base)).catch(()=>{});
  }
}
