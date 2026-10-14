import fs from 'node:fs/promises';
import path from 'node:path';
import {safeConfigId} from './workspace.mjs';
import {getJevProvider,validateJevProviderModel} from './jev-providers.mjs';

// Public configuration metadata only, NEVER API key values.
const KEYS=['schemaVersion','caseId','provider','model','credentialEnvVar'];
const fail=message=>{throw Error('YA AI Jev setup: '+message);};

export function jevProfilePath({workspaceRoot,caseId}={}) {
  if(typeof workspaceRoot!=='string'||!workspaceRoot.trim())fail('explicit workspace required');
  const id=safeConfigId(caseId,'case id');
  return path.join(path.resolve(workspaceRoot),'integrations','jev.'+id+'.json');
}

export function makeJevProfile({caseId,provider='openrouter',model,credentialEnvVar}={}) {
  const id=safeConfigId(caseId,'case id');
  const selected=getJevProvider(provider);
  const chosenModel=validateJevProviderModel(provider,model||selected.defaultModel);
  const secretName=credentialEnvVar===undefined ? selected.credentialNames[0] : credentialEnvVar;
  if(!selected.credentialNames.includes(secretName)) {
    fail('credentialEnvVar must be one of '+selected.credentialNames.join(', ')+
      '; enter an ENVIRONMENT VARIABLE NAME, not the secret itself');
  }
  return {schemaVersion:1,caseId:id,provider,model:chosenModel,credentialEnvVar:secretName};
}

export function validateJevProfile(value,caseId){
  const id=safeConfigId(caseId,'case id');
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join('|')!==KEYS.slice().sort().join('|')||
     value.schemaVersion!==1||value.caseId!==id) {
    fail('invalid project Jev profile shape or wrong case; no secrets may be saved here');
  }
  const expected=makeJevProfile(value);
  return expected;
}

export async function readJevProfile({workspaceRoot,caseId}={}){
  const filepath=jevProfilePath({workspaceRoot,caseId});
  const root=path.resolve(workspaceRoot);
  // Fail closed on a symlink in the workspace or integration path.
  let current=path.parse(root).root;
  const components=path.relative(current,path.dirname(filepath)).split(path.sep).filter(Boolean);
  for(const component of components){
    current=path.join(current,component);
    let stat;
    try{stat=await fs.lstat(current);}
    catch(err){if(err.code==='ENOENT')return null;throw err;}
    if(stat.isSymbolicLink()||!stat.isDirectory())fail('unsafe profile directory');
  }
  let stat;
  try{stat=await fs.lstat(filepath);}
  catch(err){if(err.code==='ENOENT')return null;throw err;}
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>8192)
    fail('unsafe or oversized Jev profile');
  let data;
  try{data=JSON.parse(await fs.readFile(filepath,'utf8'));}
  catch{fail('invalid Jev profile JSON');}
  return validateJevProfile(data,caseId);
}

export function publicJevProfile(profile,env=process.env) {
  const p=validateJevProfile(profile,profile?.caseId);
  return {
    provider:p.provider,model:p.model,credentialEnvVar:p.credentialEnvVar,
    credentialPresent:typeof env?.[p.credentialEnvVar]==='string'&&Boolean(env[p.credentialEnvVar].trim()),
    credentialVerified:false,providerReachableVerified:false,
    pricingVerified:false,networkCalled:false,paidRequests:0,
    note:'Profile saved without a secret. Key presence does not verify access, quota, model or price.',
  };
}
