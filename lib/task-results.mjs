import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readTask, listTasks } from './task-registry.mjs';
import { safeConfigId } from './workspace.mjs';

const FAIL = message => { throw Error('YA AI task artifact: ' + message); };
const MAX_BYTES = 5 * 1024 * 1024;
const safeId = id => {
  if(typeof id !== 'string' || !/^task-[0-9a-f-]{36}$/.test(id)) FAIL('invalid task ID');
  return id;
};
const hash = data => createHash('sha256').update(data).digest('hex');
const isSha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const checkDir = async (dirname,create = false) => {
  if(create)await fs.mkdir(dirname,{recursive:true,mode:0o700});
  const st=await fs.lstat(dirname);
  if(!st.isDirectory()||st.isSymbolicLink())FAIL('unsafe directory: '+dirname);
};
const requireRecord = (v,id) => {
  if(!v||v.schemaVersion!==1||v.taskId!==id||v.origin!=='cli'||
     v.event?.type!=='artifact_linked'||v.event.by!=='cli'||
     typeof v.event.at!=='string'||!Number.isFinite(Date.parse(v.event.at))||
     !v.artifact||!isSha(v.artifact.sha256)||
     !Number.isInteger(v.artifact.sizeBytes)||v.artifact.sizeBytes<1||
     v.artifact.sizeBytes>MAX_BYTES||
     !['results','snapshots'].includes(v.artifact.relativeJsonPath?.split('/')[0])||
     v.artifact.source===undefined||typeof v.artifact.source!=='string'||
     typeof v.artifact.sourceFileGeneratedAt!=='string'&&v.artifact.sourceFileGeneratedAt!==null||
     (v.artifact.measuredCostUsd!==null&&
       (typeof v.artifact.measuredCostUsd!=='number'||!Number.isFinite(v.artifact.measuredCostUsd)||v.artifact.measuredCostUsd<0))||
     typeof v.artifact.measuredCostSource !== 'string' && v.artifact.measuredCostSource!==null) {
    FAIL('corrupted task artifact event: '+id);
  }
  return v;
};
const validateRelative = (input,caseId,resultPrefix) => {
  if(typeof input!=='string'||input.length>450||input.includes('\\')||input.includes('\0')||
     input.startsWith('/')||input.includes('//'))FAIL('invalid relative JSON path');
  const parts=input.split('/');
  if(parts.length<2 || parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||
     !parts.at(-1).endsWith('.json')||!['results','snapshots'].includes(parts[0])){
    FAIL('JSON must reside under workspace results/ or snapshots/ without traversal');
  }
  if(parts[0]==='results'){
    const prefix=safeConfigId(resultPrefix,'result prefix');
    if(parts.length!==2||!parts[1].startsWith(prefix+'-')){
      FAIL('saved result does not belong to the selected case prefix');
    }
  } else {
    if(parts.length<3||parts[1]!==caseId)FAIL('snapshot is not in the selected case');
  }
  return input;
};
const resolveArtifact = async (root,relativeJsonPath,caseId,resultPrefix) => {
  const relative=validateRelative(relativeJsonPath,caseId,resultPrefix);
  const resolved=path.resolve(root,relative);
  // All directory segments and the file must be real paths, not symlinks.
  let current=path.resolve(root);
  await checkDir(current);
  const segments=relative.split('/');
  for(let i=0;i<segments.length;i++){
    current=path.join(current,segments[i]);
    const st=await fs.lstat(current);
    if(st.isSymbolicLink())FAIL('symlinked source files are not accepted');
    if(i<segments.length-1){if(!st.isDirectory())FAIL('invalid source directory');}
    else if(!st.isFile()||st.size<1||st.size>MAX_BYTES)FAIL('source JSON must be a regular file of at most 5 MiB');
  }
  if(current!==resolved)FAIL('source path mismatch');
  const raw=await fs.readFile(resolved);
  if(raw.length>MAX_BYTES)FAIL('source JSON exceeds size limit');
  let source;
  try{source=JSON.parse(raw.toString('utf8'));}
  catch{FAIL('saved artifact is not valid JSON');}
  if(!source||Array.isArray(source)||typeof source!=='object')FAIL('saved artifact must be JSON object');
  if(source.caseId!==undefined&&source.caseId!==caseId)FAIL('source caseId does not match task case');
  if(source.case?.id!==undefined&&source.case.id!==caseId)FAIL('source case.id does not match task case');
  const summary=source.summary??{};
  let measuredCostUsd=null,measuredCostSource=null;
  for(const field of ['measuredModelCostUsd','measuredCostSubtotal','measuredCostSubtotalUsd']){
    const v=summary?.[field];
    if(typeof v==='number'&&Number.isFinite(v)&&v>=0){
      measuredCostUsd=v;measuredCostSource='summary.'+field;break;
    }
  }
  return {
    relativeJsonPath:relative,sha256:hash(raw),sizeBytes:raw.length,
    source:typeof source.source==='string'?source.source:'unknown',
    sourceFileGeneratedAt:typeof source.generatedAt==='string'?source.generatedAt:null,
    measuredCostUsd,measuredCostSource,
  };
};
const linksDir = root => path.join(path.resolve(root),'tasks','links');
const linkPath = (root,id) => path.join(linksDir(root),safeId(id)+'.json');
const verifiedCase = async (root,task) => {
  await checkDir(root);
  const cases=path.join(root,'cases');
  await checkDir(cases);
  const file=path.join(cases,safeConfigId(task.caseId,'case')+'.json');
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink())FAIL('unsafe case config');
  const conf=JSON.parse(await fs.readFile(file,'utf8'));
  if(conf?.id!==task.caseId)FAIL('case no longer matches task');
  return conf;
};
async function linkStorage(root,{create=false}={}){
  const tasks=path.join(path.resolve(root),'tasks');
  await checkDir(tasks);
  const dir=linksDir(root);
  try{await checkDir(dir,create);}
  catch(e){if(!create&&e.code==='ENOENT')return null;throw e;}
  return dir;
}
/**
 * An immutable one-time attachment of an already saved result.
 * The initial draft JSON is never rewritten. There is no worker execution.
 */
export async function linkSavedArtifact({
  workspaceRoot,id,relativeJsonPath,origin='cli',
}={}){
  if(origin!=='cli')FAIL('MCP and remote attachment writes are disabled');
  const task=await readTask({workspaceRoot,id});
  const root=path.resolve(workspaceRoot);
  const conf=await verifiedCase(root,task);
  const artifact=await resolveArtifact(root,relativeJsonPath,task.caseId,conf.resultPrefix);
  await linkStorage(root,{create:true});
  const record={
    schemaVersion:1,taskId:task.id,origin:'cli',
    event:{type:'artifact_linked',at:new Date().toISOString(),by:'cli'},
    artifact,
  };
  const file=linkPath(root,task.id);
  const temp=path.join(linksDir(root),'.'+task.id+'.'+randomUUID()+'.tmp');
  try{
    await fs.writeFile(temp,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
    // Atomic create-if-absent: linking cannot replace an earlier event,
    // including when two independent CLI processes race.
    await fs.link(temp,file);
  }finally{await fs.rm(temp,{force:true});}
  return readTaskWithArtifact({workspaceRoot,id});
}
export async function readTaskWithArtifact({workspaceRoot,id}={}){
  const task=await readTask({workspaceRoot,id});
  const root=path.resolve(workspaceRoot);
  const dir=await linkStorage(root);
  if(!dir)return task;
  const file=linkPath(root,task.id);
  let stat;
  try{stat=await fs.lstat(file);}
  catch(err){if(err.code==='ENOENT')return task;throw err;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)FAIL('unsafe task link');
  const event=requireRecord(JSON.parse(await fs.readFile(file,'utf8')),task.id);
  const config=await verifiedCase(root,task);
  const current=await resolveArtifact(root,event.artifact.relativeJsonPath,task.caseId,config.resultPrefix);
  if(hash(JSON.stringify(current))!==hash(JSON.stringify(event.artifact))){
    FAIL('linked artifact changed or provenance no longer matches: '+task.id);
  }
  return {
    ...task,status:'result_linked',
    updatedAt:event.event.at,
    linkedArtifact:event.artifact,
    events:[...task.events,event.event],
    note:'Existing saved artifact linked for inspection only. YA AI did not execute this task or authorize its cost.',
  };
}
export async function listTasksWithArtifacts({workspaceRoot,caseId,limit=30}={}){
  // Load all in scope first: corrupted task links fail closed even when the
  // caller asks for a small page of results.
  const raw=await listTasks({workspaceRoot,caseId,limit:200});
  const tasks=await Promise.all(raw.tasks.map(x=>readTaskWithArtifact({workspaceRoot,id:x.id})));
  if(raw.omitted>0)FAIL('workspace exceeds safe 200-task listing cap');
  return {
    total:tasks.length,
    tasks:tasks.slice(0,limit),
    omitted:Math.max(0,tasks.length-limit),
  };
}
