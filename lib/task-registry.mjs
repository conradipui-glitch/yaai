import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeConfigId } from './workspace.mjs';

export const TASK_SCHEMA_VERSION = 1;
export const TASK_KINDS = Object.freeze(['research', 'evaluation', 'report', 'export']);
const TASK_ID_PATTERN = /^task-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VALID_ORIGINS = ['cli']; // No other client has task write permission yet.
const fail = message => { throw Error('YA AI task registry: ' + message); };

function workspace(root) {
  if (typeof root !== 'string' || !root.trim()) fail('explicit workspace is required');
  return path.resolve(root);
}
function taskDir(root) {
  return path.join(workspace(root), 'tasks');
}
function taskId(value) {
  if (typeof value !== 'string' || !TASK_ID_PATTERN.test(value)) fail('invalid task ID');
  return value;
}
function titleText(value, label, limit, { required = true } = {}) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    fail(label + ' must be text');
  }
  const result = value.trim();
  if ((required && !result) || result.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result)) {
    fail(label + ' is empty, too long or contains control characters');
  }
  return result;
}
async function verifyDirectory(directory, { create = false } = {}) {
  if (create) await fs.mkdir(directory, {recursive:true,mode:0o700});
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('unsafe storage directory: ' + directory);
}
async function ensureTaskDir(root, { create = false } = {}) {
  await verifyDirectory(workspace(root));
  const directory = taskDir(root);
  try { await verifyDirectory(directory,{create}); }
  catch(err){if(err.code === 'ENOENT' && !create)return null;throw err;}
  return directory;
}
function validateRecord(record, id) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
    record.schemaVersion !== TASK_SCHEMA_VERSION || record.id !== id ||
    !TASK_KINDS.includes(record.kind) || record.status !== 'draft' ||
    record.origin !== 'cli' || typeof record.title !== 'string' ||
    !record.title.trim() || record.title.length > 140 ||
    typeof record.caseId !== 'string' ||
    !Array.isArray(record.events) || record.events.length !== 1 ||
    record.events[0]?.type !== 'draft_created' ||
    record.events[0]?.at !== record.createdAt ||
    record.events[0]?.by !== 'cli' ||
    record.updatedAt !== record.createdAt ||
    record.policy?.executed !== false ||
    record.policy?.paidCallsAuthorized !== false ||
    record.policy?.externalMutationsAuthorized !== false ||
    typeof record.description !== 'string' || record.description.length > 1000 ||
    !Number.isFinite(Date.parse(record.createdAt))) {
    fail('invalid or corrupted task record: ' + id);
  }
  safeConfigId(record.caseId, 'case id');
  return record;
}
export async function createTask({
  workspaceRoot, caseId, title, kind = 'research',
  description = '', origin = 'cli',
} = {}) {
  const root = workspace(workspaceRoot);
  const caseKey = safeConfigId(caseId,'case id');
  const normalizedTitle = titleText(title,'title',140);
  const normalizedDescription = titleText(description,'description',1000,{required:false});
  if (!TASK_KINDS.includes(kind)) fail('unsupported task kind: ' + kind);
  if (!VALID_ORIGINS.includes(origin)) fail('task writes from this interface are not enabled');
  await verifyDirectory(root);
  const caseFile=path.join(root,'cases',caseKey+'.json');
  const caseStat=await fs.lstat(caseFile);
  if (!caseStat.isFile() || caseStat.isSymbolicLink()) fail('case is not a regular file');
  const sourceCase=JSON.parse(await fs.readFile(caseFile,'utf8'));
  if (sourceCase?.id !== caseKey) fail('case file does not match case ID');
  const dir=await ensureTaskDir(root,{create:true});
  const id='task-'+randomUUID();
  const at=new Date().toISOString();
  const record={
    schemaVersion:TASK_SCHEMA_VERSION,id,caseId:caseKey,kind,
    title:normalizedTitle,description:normalizedDescription,
    status:'draft',origin,
    createdAt:at,updatedAt:at,
    events:[{type:'draft_created',at,by:origin}],
    policy:{executed:false,paidCallsAuthorized:false,externalMutationsAuthorized:false},
  };
  const filename=path.join(dir,id+'.json');
  const temp=path.join(dir,'.'+id+'.'+process.pid+'.tmp');
  try {
    await fs.writeFile(temp,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
    // The final file becomes visible atomically to concurrent readers.
    await fs.rename(temp,filename);
  } catch(error) {
    await fs.rm(temp,{force:true});
    throw error;
  }
  return record;
}
export async function readTask({workspaceRoot,id}={}) {
  const key=taskId(id);
  const dir=await ensureTaskDir(workspaceRoot);
  if(!dir)fail('task not found: ' + key);
  const file=path.join(dir,key+'.json');
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink())fail('unsafe task record: '+key);
  const record=JSON.parse(await fs.readFile(file,'utf8'));
  return validateRecord(record,key);
}
export async function listTasks({workspaceRoot,caseId,limit=30}={}) {
  if (!Number.isInteger(limit)||limit<1||limit>200)fail('list limit must be 1–200');
  const caseKey=caseId===undefined||caseId===null ? null : safeConfigId(caseId,'case id');
  const dir=await ensureTaskDir(workspaceRoot);
  if(!dir)return {total:0,tasks:[],note:'No tasks registered in this workspace.'};
  const filenames=(await fs.readdir(dir)).filter(x=>x.endsWith('.json')).sort();
  const records=[];
  for(const name of filenames) {
    const id=name.slice(0,-5);
    // Don't silently return forged or corrupted draft records.
    records.push(await readTask({workspaceRoot,id}));
  }
  const matching=records.filter(x=>caseKey===null||x.caseId===caseKey)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  return {total:matching.length,tasks:matching.slice(0,limit),omitted:Math.max(0,matching.length-limit)};
}
