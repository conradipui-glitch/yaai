import fs from 'node:fs/promises';
import path from 'node:path';
import { ENGINE_ROOT, safeConfigId } from './workspace.mjs';
import {jevProfilePath,makeJevProfile,readJevProfile,publicJevProfile} from './setup-jev.mjs';
import {offlineCapabilityReport} from './provider-capabilities.mjs';

const fail = message => { throw Error('YA AI setup: ' + message); };
const MODES = Object.freeze(['local', 'harness']);
const DIRS = ['cases', 'presets', 'planners', 'results', 'snapshots', 'inputs', 'tasks', 'integrations'];
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function setupLocations({workspaceRoot,caseId,resultPrefix}={}) {
  if(typeof workspaceRoot!=='string'||!workspaceRoot.trim())fail('explicit --workspace is required');
  const root=path.resolve(workspaceRoot);
  const id=safeConfigId(caseId,'case id');
  const prefix=safeConfigId(resultPrefix||id,'result prefix');
  const engine=path.resolve(ENGINE_ROOT);
  if(root===engine||root.startsWith(engine+path.sep))
    fail('workspace must live OUTSIDE the public engine checkout');
  if(root===path.parse(root).root)
    fail('refusing to use a filesystem root as a workspace');
  return {root,id,prefix,casePath:path.join(root,'cases',id+'.json'),
    presetPath:path.join(root,'presets',prefix+'.json'),
    plannerPath:path.join(root,'planners',prefix+'.json'),
    mcpPath:path.join(root,'integrations','mcp.'+id+'.local.json'),
    jevPath:jevProfilePath({workspaceRoot:root,caseId:id})};
}
async function safeDirectory(target,{create=false}={}) {
  const abs=path.resolve(target),root=path.parse(abs).root;
  let current=root;
  for(const part of abs.slice(root.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    let st;
    try{st=await fs.lstat(current);}
    catch(err){
      if(err.code!=='ENOENT')throw err;
      if(!create)return false;
      try{await fs.mkdir(current,{mode:0o700});}
      catch(e){if(e.code!=='EEXIST')throw e;}
      st=await fs.lstat(current);
    }
    if(st.isSymbolicLink()||!st.isDirectory())
      fail('path contains symlink or non-directory: '+current);
  }
  return true;
}
async function existingJson(file){
  let stat;
  try{stat=await fs.lstat(file);}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)
    fail('unsafe config file: '+file);
  let value;
  try{value=JSON.parse(await fs.readFile(file,'utf8'));}
  catch{fail('malformed JSON file: '+file);}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('config must be JSON object: '+file);
  return value;
}
async function safeCreate(file,value){
  const data=JSON.stringify(value,null,2)+'\n';
  try{await fs.writeFile(file,data,{flag:'wx',mode:0o600});return true;}
  catch(e){if(e.code!=='EEXIST')throw e;}
  return false;
}
function validateCase(value,{id,prefix}){
  if(value?.id!==id||value?.resultPrefix!==prefix)
    fail('existing case has different ID/prefix; refusing to rewrite');
  if(!Array.isArray(value.seeds)||!Array.isArray(value.regions))
    fail('existing case is missing required seed/region arrays');
}
function validatePreset(value,prefix){
  if(value?.id!==prefix||!Array.isArray(value.intents)||
     !Array.isArray(value.negativeKeywords)||
     !value.queryClassification||typeof value.queryClassification!=='object')
    fail('existing preset is incompatible; refusing to rewrite');
}
function validatePlanner(value){
  if(!Array.isArray(value.targets))fail('existing planner has no targets array');
}
function caseTemplate(id,prefix,name){
  return {id,name,description:'New private workspace; add business-specific seeds and regions before collecting paid data.',
    resultPrefix:prefix,regions:[],devices:['DEVICE_ALL'],numPhrases:20,seeds:[]};
}
function presetTemplate(prefix,name){
  return {id:prefix,name:name+' intent preset',
    description:'Empty by design: classification requires manually reviewed business-specific terms.',
    negativeKeywords:[],
    queryClassification:{commercialHeadMaxWords:4,commercialKeywords:[],
      informationalKeywords:[],commercialHeadKeywords:[]},
    intents:[]};
}
function plannerTemplate(){
  return {defaultFocusWeight:1,nowCount:5,nextCount:10,
    genericGuidePath:'/guides/{slug}/',genericLandingPath:'/{slug}/',targets:[]};
}
function mcpTemplate({root,id}) {
  return {mcpServers:{yaai:{command:process.execPath,
    args:[path.join(ENGINE_ROOT,'mcp-server.mjs'),'--workspace',root,'--case',id]}}};
}
function validateMcp(value,expected) {
  const actual=value?.mcpServers?.yaai;
  const match=expected.mcpServers.yaai;
  if(!actual||actual.command!==match.command||
     JSON.stringify(actual.args)!==JSON.stringify(match.args))
    fail('existing MCP config differs from this checkout/workspace; review it manually; will not overwrite');
}
async function checkPrefixCollision({root,id,prefix}){
  const cases=path.join(root,'cases');
  if(!await safeDirectory(cases))return;
  for(const name of await fs.readdir(cases)){
    if(!name.endsWith('.json')||name===id+'.json')continue;
    const candidate=await existingJson(path.join(cases,name));
    if(candidate?.resultPrefix===prefix)
      fail('another case already uses resultPrefix "'+prefix+'"');
  }
}
function plan(loc,mode) {
  return {mode,workspaceRoot:loc.root,caseId:loc.id,resultPrefix:loc.prefix,
    directories:DIRS.map(p=>path.join(loc.root,p)),
    configFiles:[loc.casePath,loc.presetPath,loc.plannerPath,loc.jevPath,
      ...(mode==='harness'?[loc.mcpPath]:[])],
    paidRequests:0,llmApiRequired:false,
    note:'Configuration only. Blank search seeds, regions, intents, and page targets are NOT real research.'};
}
export async function setupWorkspace({workspaceRoot,caseId,
  resultPrefix,projectName,mode='local',dryRun=false,
  jevProvider,jevModel,jevKeyEnv,env=process.env}={}){
  if(!MODES.includes(mode))fail('mode must be local or harness');
  const loc=setupLocations({workspaceRoot,caseId,resultPrefix});
  const name=String(projectName||loc.id).trim();
  if(!name||name.length>100||/[\x00-\x1f]/.test(name))fail('project name must be 1–100 plain characters');
  const planned=plan(loc,mode);
  // Reject existing incompatible configs BEFORE writing new files.
  await safeDirectory(loc.root);
  for(const dirname of planned.directories)await safeDirectory(dirname);
  await checkPrefixCollision(loc);
  const existing={
    case:await existingJson(loc.casePath),
    preset:await existingJson(loc.presetPath),
    planner:await existingJson(loc.plannerPath),
    mcp:mode==='harness'?await existingJson(loc.mcpPath):null,
    jev:await readJevProfile({workspaceRoot:loc.root,caseId:loc.id}),
  };
  if(existing.case)validateCase(existing.case,loc);
  if(existing.preset)validatePreset(existing.preset,loc.prefix);
  if(existing.planner)validatePlanner(existing.planner);
  if(existing.mcp)validateMcp(existing.mcp,mcpTemplate(loc));
  const switching=Boolean(jevProvider&&jevProvider!==existing.jev?.provider);
  const chosenJev=makeJevProfile({
    caseId:loc.id,provider:jevProvider||existing.jev?.provider||'openrouter',
    model:jevModel||(switching?undefined:existing.jev?.model),
    credentialEnvVar:jevKeyEnv||(switching?undefined:existing.jev?.credentialEnvVar),
  });
  if(existing.jev&&JSON.stringify(existing.jev)!==JSON.stringify(chosenJev))
    fail('existing project Jev provider/model/key environment differs; no silent overwrite. Review the profile before an explicit migration.');
  const jevStatus=publicJevProfile(chosenJev,env);
  if(dryRun)return {...planned,dryRun:true,jev:jevStatus,wouldCreate:planned.configFiles
      .filter(file=>file===loc.casePath?!existing.case:
        file===loc.presetPath?!existing.preset:
        file===loc.plannerPath?!existing.planner:
        file===loc.jevPath?!existing.jev:!existing.mcp)};
  await safeDirectory(loc.root,{create:true});
  for(const dirname of planned.directories)await safeDirectory(dirname,{create:true});
  await checkPrefixCollision(loc);
  const made=[];
  const configs=[
    [loc.casePath,caseTemplate(loc.id,loc.prefix,name),validateCase],
    [loc.presetPath,presetTemplate(loc.prefix,name),validatePreset],
    [loc.plannerPath,plannerTemplate(),validatePlanner],
    [loc.jevPath,chosenJev,()=>{}],
    ...(mode==='harness'?[[loc.mcpPath,mcpTemplate(loc),validateMcp]]:[]),
  ];
  for(const [file,value,validate] of configs){
    if(await safeCreate(file,value)) made.push(file);
    const actual=await existingJson(file);
    if(file===loc.casePath)validate(actual,loc);
    else if(file===loc.presetPath)validate(actual,loc.prefix);
    else if(file===loc.plannerPath)validate(actual);
    else if(file===loc.jevPath){
      const profile=await readJevProfile({workspaceRoot:loc.root,caseId:loc.id});
      if(JSON.stringify(profile)!==JSON.stringify(chosenJev))
        fail('project Jev provider profile differs; refusing to overwrite');
    }else validate(actual,value);
  }
  return {...planned,dryRun:false,jev:jevStatus,createdFiles:made,reusedFiles:planned.configFiles.filter(p=>!made.includes(p)),
    next:mode==='harness'?
      'Copy the private '+path.basename(loc.mcpPath)+' entry into a compatible Harness MCP configuration. No API key is needed for saved-data reads.' :
      'Run npm run setup -- --check ... or npm run mcp -- --workspace ROOT --case CASE for saved-data inspection.',
    providerNext:'Optional Jev calls use '+chosenJev.provider+' / '+chosenJev.model+
      '. Supply '+chosenJev.credentialEnvVar+' only via your protected environment (never here), then run: npm run jev:provider -- --workspace "'+
      '<PRIVATE_WORKSPACE>" --case <CASE_ID>. This is offline; paid Jev calls still require explicit --execute.',
  };
}
export async function inspectSetup({workspaceRoot,caseId,resultPrefix,mode='local',
  jevProvider,jevModel,jevKeyEnv,env=process.env}={}){
  if(!MODES.includes(mode))fail('mode must be local or harness');
  const loc=setupLocations({workspaceRoot,caseId,resultPrefix});
  const details={nodeVersion:process.versions.node,nodeSupported:Number(process.versions.node.split('.')[0])>=20,
    mode,workspaceRoot:loc.root,caseId:loc.id,
    checkedWithoutNetwork:true,paidRequests:0,llmApiRequired:false,checks:[]};
  const rootOk=await safeDirectory(loc.root);
  details.checks.push({name:'workspace',ready:rootOk});
  if(!rootOk)return {...details,ready:false};
  const dirs=plan(loc,mode).directories;
  for(const dir of dirs)details.checks.push({name:path.relative(loc.root,dir),ready:await safeDirectory(dir)});
  const defs=[
    ['case',loc.casePath,v=>validateCase(v,loc)],
    ['preset',loc.presetPath,v=>validatePreset(v,loc.prefix)],
    ['planner',loc.plannerPath,validatePlanner],
    ...(mode==='harness'?[['mcp',loc.mcpPath,v=>validateMcp(v,mcpTemplate(loc))]]:[]),
  ];
  for(const [name,file,validate] of defs){
    const data=await existingJson(file);
    if(data)validate(data);
    details.checks.push({name,ready:!!data});
  }
  await checkPrefixCollision(loc);
  const savedJev=await readJevProfile({workspaceRoot:loc.root,caseId:loc.id});
  if(savedJev){
    if(jevProvider&&jevProvider!==savedJev.provider)fail('saved Jev provider differs from requested check');
    if(jevModel&&jevModel!==savedJev.model)fail('saved Jev model differs from requested check');
    if(jevKeyEnv&&jevKeyEnv!==savedJev.credentialEnvVar)fail('saved Jev key environment differs from requested check');
  }
  details.jev=savedJev?publicJevProfile(savedJev,env):null;
  details.capabilities=savedJev?offlineCapabilityReport({provider:savedJev.provider,
    credentialPresent:details.jev.credentialPresent}):null;
  details.checks.push({name:'jev-profile',ready:Boolean(savedJev)});
  const chosen=await existingJson(loc.casePath);
  details.inputsConfigured=chosen?chosen.seeds.length>0&&chosen.regions.length>0:false;
  details.ready=details.nodeSupported&&details.checks.every(x=>x.ready);
  details.note=details.ready?'Local storage configuration valid. Provider APIs and collection capabilities NOT tested.':
    'One or more local setup requirements are missing. Run setup create for this workspace.';
  return details;
}
