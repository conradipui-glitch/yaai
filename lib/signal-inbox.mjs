import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {safeConfigId} from './workspace.mjs';
import {listTasksWithExecution} from './task-executor.mjs';

/**
 * Local signal inbox v1. Signals are derived from durable task events,
 * never invented by an LLM or sent to the network. Acknowledgements are
 * write-once local records and do not alter any task or source evidence.
 */
const fail=message=>{throw Error('YA AI signals: '+message);};
const SIGNAL_ID=/^signal-[0-9a-f]{40}$/;
const SUMMARIES=Object.freeze({
  run_failed:'Offline research attempt failed',
  run_succeeded:'Offline research attempt completed',
  run_interrupted:'Offline research attempt interrupted',
  artifact_linked:'Earlier saved result linked for review',
});
const KIND=Object.freeze({
  run_failed:'warning',run_succeeded:'info',
  run_interrupted:'warning',artifact_linked:'info',
});
const sha=value=>createHash('sha256').update(value).digest('hex');
async function safeDirectory(dirname,create=false){
  const root=path.parse(path.resolve(dirname)).root;
  let current=root;
  for(const part of path.resolve(dirname).slice(root.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    let st;
    try{st=await fs.lstat(current);}
    catch(e){
      if(e.code!=='ENOENT')throw e;
      if(!create)return false;
      try{await fs.mkdir(current,{mode:0o700});}
      catch(error){if(error.code!=='EEXIST')throw error;}
      st=await fs.lstat(current);
    }
    if(st.isSymbolicLink()||!st.isDirectory())fail('unsafe or symlinked directory');
  }
  return true;
}
const rootOf=v=>{
  if(typeof v!=='string'||!v.trim())fail('explicit workspace is required');
  return path.resolve(v);
};
async function ensureCase(root,caseId){
  if(!await safeDirectory(root))fail('workspace unavailable');
  const dir=path.join(root,'cases');
  if(!await safeDirectory(dir))fail('case directory unavailable');
  const file=path.join(dir,caseId+'.json'),st=await fs.lstat(file);
  if(st.isSymbolicLink()||!st.isFile()||st.size>65536)fail('invalid case config');
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  if(data?.id!==caseId)fail('case mismatch');
}
function signalFor(task,event,type){
  const attempt=Number.isInteger(event.attempt)?event.attempt:null;
  const stable=['v1',task.caseId,task.id,type,attempt??'none'].join('\0');
  return {
    id:'signal-'+sha(stable).slice(0,40),
    caseId:task.caseId,taskId:task.id,
    type,severity:KIND[type],summary:SUMMARIES[type],
    occurredAt:event.at,
    attempt,
    errorCode:type==='run_failed'&&task.execution?.lastAttempt===attempt
      ?task.execution.errorCode:null,
  };
}
function fromTask(task){
  const events=task.events||[];
  const finished=new Set(events.filter(x=>x.type==='run_succeeded'||x.type==='run_failed')
    .map(x=>x.attempt));
  const signals=[];
  for(const e of events){
    if(e.type==='run_started'){
      // Only an unclosed attempt that is no longer running is interrupted.
      if(!finished.has(e.attempt)&&(task.execution?.lastAttempt!==e.attempt||
          task.execution?.status==='interrupted')){
        signals.push(signalFor(task,e,'run_interrupted'));
      }
    }else if(Object.hasOwn(SUMMARIES,e.type))signals.push(signalFor(task,e,e.type));
  }
  return signals;
}
function ackDir(root,id){return path.join(root,'tasks','signal-acks',id);}
function ackFile(root,caseId,id){return path.join(ackDir(root,caseId),id+'.json');}
async function readAck(root,caseId,id){
  const dir=ackDir(root,caseId);
  if(!await safeDirectory(dir))return null;
  const file=ackFile(root,caseId,id);
  let st;
  try{st=await fs.lstat(file);}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(st.isSymbolicLink()||!st.isFile()||st.size>4096)fail('unsafe acknowledgement');
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  if(data?.schemaVersion!==1||data.caseId!==caseId||data.signalId!==id||
      data.origin!=='cli'||!Number.isFinite(Date.parse(data.acknowledgedAt)))
    fail('corrupted acknowledgement');
  return data.acknowledgedAt;
}
export async function listSignals({
  workspaceRoot,caseId,limit=50,includeAcknowledged=true,
}={}){
  const root=rootOf(workspaceRoot),id=safeConfigId(caseId,'case id');
  if(!Number.isInteger(limit)||limit<1||limit>200)fail('limit must be 1–200');
  if(typeof includeAcknowledged!=='boolean')fail('includeAcknowledged must be boolean');
  await ensureCase(root,id);
  // The underlying task implementation already validates evidence and
  // fails closed on tampered task/result records.
  const records=await listTasksWithExecution({
    workspaceRoot:root,caseId:id,limit:200,
  });
  if(records.omitted>0)fail('workspace has too many tasks for a complete signal scan');
  const all=records.tasks.flatMap(fromTask);
  const ids=new Set();
  for(const signal of all){
    if(ids.has(signal.id))fail('duplicate durable source event');
    ids.add(signal.id);
    signal.acknowledgedAt=await readAck(root,id,signal.id);
    signal.acknowledged=signal.acknowledgedAt!==null;
  }
  const filtered=all.filter(s=>includeAcknowledged||!s.acknowledged)
    .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
  return {
    caseId:id,total:filtered.length,unread:all.filter(s=>!s.acknowledged).length,
    signals:filtered.slice(0,limit),omitted:Math.max(0,filtered.length-limit),
    delivery:'local-only',notificationSent:false,
  };
}
export async function acknowledgeSignal({workspaceRoot,caseId,signalId}={}){
  const root=rootOf(workspaceRoot),id=safeConfigId(caseId,'case id');
  if(typeof signalId!=='string'||!SIGNAL_ID.test(signalId))fail('invalid signal ID');
  const feed=await listSignals({workspaceRoot:root,caseId:id,limit:200});
  const signal=feed.signals.find(x=>x.id===signalId);
  if(!signal)fail('signal not found in selected client case');
  if(signal.acknowledged)return {...signal,alreadyAcknowledged:true};
  const dir=ackDir(root,id);
  await safeDirectory(dir,true);
  const record={
    schemaVersion:1,caseId:id,signalId,origin:'cli',
    acknowledgedAt:new Date().toISOString(),
  };
  try{
    await fs.writeFile(ackFile(root,id,signalId),JSON.stringify(record,null,2)+'\n',{
      flag:'wx',mode:0o600,
    });
  }catch(e){if(e.code!=='EEXIST')throw e;}
  // Concurrency: read the winner's actual persisted timestamp.
  const persisted=await readAck(root,id,signalId);
  if(!persisted)fail('acknowledgement was not persisted');
  return {...signal,acknowledged:true,acknowledgedAt:persisted};
}
