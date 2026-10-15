import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {safeConfigId} from './workspace.mjs';
import {listTasksWithExecution,readTaskWithExecution} from './task-executor.mjs';
import {listSignals} from './signal-inbox.mjs';

const fail=message=>{throw Error('YA AI VPS reader: '+message);};
const HEADERS=Object.freeze({
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
  'x-frame-options':'DENY',
  'cross-origin-resource-policy':'same-origin',
});
const safeToken=value=>{
  if(typeof value!=='string'||value.length<32||value.length>4096||
      /\s/.test(value))fail('read token must be 32–4096 non-whitespace characters');
  return value;
};
const digest=value=>createHash('sha256').update(value).digest();
const send=(res,status,data,extra={})=>{
  const body=JSON.stringify(data);
  res.writeHead(status,{...HEADERS,...extra,'content-length':Buffer.byteLength(body)});
  res.end(body);
};
const displayTask=task=>({
  id:task.id,caseId:task.caseId,kind:task.kind,title:task.title,
  status:task.status,createdAt:task.createdAt,updatedAt:task.updatedAt,
  attemptCount:task.execution?.attempts??0,
  lastErrorCode:task.execution?.errorCode??null,
  sourceSha256:task.linkedArtifact?.sha256??null,
  outputSha256:task.execution?.output?.sha256??null,
  recordedMeasuredCostUsd:task.linkedArtifact?.measuredCostUsd??null,
  note:'Read-only task metadata; no raw client evidence or paid operation exposed.',
});
async function checkCase(workspaceRoot,caseId) {
  if(!workspaceRoot||typeof workspaceRoot!=='string')fail('explicit private workspace required');
  const root=path.resolve(workspaceRoot);
  const folder=path.join(root,'cases'),file=path.join(folder,caseId+'.json');
  for(const dir of [root,folder]){
    const st=await fs.lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink())fail('unsafe workspace/cases directory');
  }
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>65536)fail('unsafe case configuration');
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  if(data?.id!==caseId)fail('case ID does not match file');
  return root;
}
export async function readVpsTokenFile(filename){
  if(typeof filename!=='string'||!filename.trim())fail('token file required; set YAAI_VPS_TOKEN_FILE or systemd LoadCredential');
  const file=path.resolve(filename);
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>4096)fail('unsafe read-token file');
  if(process.platform!=='win32'&&(st.mode&0o077)!==0)fail('token file accessible to group/others');
  const raw=await fs.readFile(file,'utf8');
  return safeToken(raw.trim());
}
export function makeVpsReadonlyServer({workspaceRoot,caseId,token}={}){
  const pinnedCase=safeConfigId(caseId,'case id');
  const passwordDigest=digest(safeToken(token));
  const root=path.resolve(workspaceRoot||'');
  if(!workspaceRoot)fail('private workspace path required');
  let invalidAttempts=0,windowStart=Date.now();
  const handler=async(req,res)=>{
    // This service has NO paid API routes, credentials or CORS.
    if(Date.now()-windowStart>60_000){windowStart=Date.now();invalidAttempts=0;}
    if(req.method!=='GET')return send(res,405,{error:'Method not allowed'},{allow:'GET'});
    if((req.url||'').length>2048||req.headers['content-length']||
       req.headers['transfer-encoding']){
      return send(res,400,{error:'Invalid read-only request'});
    }
    let url;
    try{url=new URL(req.url,'http://127.0.0.1');}
    catch{return send(res,400,{error:'Invalid request URL'});}
    if(url.pathname==='/healthz'&&url.search===''){
      return send(res,200,{ok:true,service:'yaai-vps-readonly',mode:'read-only'});
    }
    if(invalidAttempts>=40)return send(res,429,{error:'Too many unauthorized requests'});
    const header=req.headers.authorization;
    const value=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';
    const candidate=digest(value);
    if(!timingSafeEqual(passwordDigest,candidate)){
      invalidAttempts++;
      return send(res,401,{error:'Unauthorized'},{'www-authenticate':'Bearer realm="YA AI read-only"'});
    }
    if(url.search!=='')return send(res,404,{error:'Not found'});
    if(url.pathname==='/v1/info'){
      return send(res,200,{caseId:pinnedCase,readOnly:true,
        paidApiCallsAllowed:false,writeActionsAllowed:false,remoteMcpEnabled:false});
    }
    try{
      if(url.pathname==='/v1/signals'){
        const feed=await listSignals({
          workspaceRoot:root,caseId:pinnedCase,limit:50,
        });
        // Metadata-only: no private report content, task description or credentials.
        return send(res,200,{caseId:pinnedCase,total:feed.total,
          unread:feed.unread,omitted:feed.omitted,
          delivery:'local-only',notificationSent:false,
          signals:feed.signals.map(x=>({
            id:x.id,taskId:x.taskId,type:x.type,severity:x.severity,
            summary:x.summary,occurredAt:x.occurredAt,attempt:x.attempt,
            errorCode:x.errorCode,acknowledged:x.acknowledged,
          }))});
      }
      if(url.pathname==='/v1/tasks'){
        const tasks=await listTasksWithExecution({workspaceRoot:root,caseId:pinnedCase,limit:50});
        return send(res,200,{caseId:pinnedCase,total:tasks.total,
          omitted:tasks.omitted,tasks:tasks.tasks.map(displayTask)});
      }
      const found=/^\/v1\/tasks\/(task-[0-9a-f-]{36})$/.exec(url.pathname);
      if(found){
        const task=await readTaskWithExecution({workspaceRoot:root,id:found[1]});
        if(task.caseId!==pinnedCase)return send(res,404,{error:'Not found'});
        return send(res,200,{task:displayTask(task)});
      }
      return send(res,404,{error:'Not found'});
    }catch(err){
      // Never echo filesystem paths, provider errors or private task content.
      if(err?.code==='ENOENT'||/^YA AI task registry: task not found/.test(err?.message||'')){
        return send(res,404,{error:'Not found'});
      }
      return send(res,503,{error:'Private data unavailable or integrity validation failed'});
    }
  };
  const server=http.createServer((req,res)=>{
    handler(req,res).catch(()=>{if(!res.headersSent)send(res,503,{error:'Service temporarily unavailable'});});
  });
  server.requestTimeout=5_000;
  server.headersTimeout=5_000;
  server.keepAliveTimeout=2_000;
  server.maxHeadersCount=40;
  return server;
}
export async function startVpsReadonly({workspaceRoot,caseId,tokenFile,port=8790}={}){
  const id=safeConfigId(caseId,'case id');
  const root=await checkCase(workspaceRoot,id);
  const token=await readVpsTokenFile(tokenFile);
  if(!Number.isSafeInteger(port)||port<1||port>65535)fail('invalid listen port');
  const server=makeVpsReadonlyServer({workspaceRoot:root,caseId:id,token});
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  return server;
}
