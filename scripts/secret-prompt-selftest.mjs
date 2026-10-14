import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readHiddenSecret} from '../lib/secret-prompt.mjs';
import {offlineCapabilityReport} from '../lib/provider-capabilities.mjs';

function terminal(){
  const input=new EventEmitter();
  const rawStates=[];
  input.isTTY=true;input.isRaw=false;
  input.setRawMode=value=>{input.isRaw=value;rawStates.push(value);};
  input.resume=()=>{};input.pause=()=>{};
  return {input,rawStates};
}
function capture(){
  let output='';
  return {out:{write:chunk=>{output+=chunk;}},get:()=>output};
}
{
  const {input,rawStates}=terminal();
  const c=capture();
  const result=readHiddenSecret({input,output:c.out,label:'Secret'});
  input.emit('data',Buffer.from('s3cr'));
  input.emit('data',Buffer.from('et-VALUE\r'));
  assert.equal(await result,'s3cret-VALUE');
  assert.deepEqual(rawStates,[true,false]);
  assert.equal(input.listenerCount('data'),0);
  assert.match(c.get(),/hidden input/);
  assert.doesNotMatch(c.get(),/s3cret|VALUE/,'no secret in visible output');
}
{
  const {input,rawStates}=terminal();input.isRaw=true;
  const c=capture();
  const result=readHiddenSecret({input,output:c.out});
  input.emit('data',Buffer.from('abcx\x7fD\n'));
  assert.equal(await result,'abcD');
  assert.deepEqual(rawStates,[true,true],'preserves preexisting raw mode');
}
{
  const {input,rawStates}=terminal();
  const c=capture();
  const result=readHiddenSecret({input,output:c.out});
  input.emit('data',Buffer.from('not-logged\u0003'));
  await assert.rejects(result,/canceled/);
  assert.equal(input.listenerCount('data'),0);
  assert.deepEqual(rawStates,[true,false]);
  assert.doesNotMatch(c.get(),/not-logged/);
}
{
  const {input,rawStates}=terminal();
  const result=readHiddenSecret({input,output:capture().out});
  input.emit('data',Buffer.from('\r'));
  await assert.rejects(result,/empty credential/);
  assert.deepEqual(rawStates,[true,false]);
}
{
  const {input,rawStates}=terminal();
  const result=readHiddenSecret({input,output:capture().out,maxLength:3});
  input.emit('data',Buffer.from('abcd'));
  await assert.rejects(result,/too long/);
  assert.deepEqual(rawStates,[true,false]);
}
await assert.rejects(readHiddenSecret({
 input:{isTTY:false},output:capture().out,
}),/interactive terminal required/);

const open=offlineCapabilityReport({provider:'openrouter',credentialPresent:false});
const direct=offlineCapabilityReport({provider:'typesafe',credentialPresent:true});
const status=(report,id)=>report.operations.find(x=>x.id===id);
assert.equal(open.checkedWithoutNetwork,true);
assert.equal(open.liveAccountVerified,false);
assert.equal(status(open,'saved-evidence').available,true);
assert.equal(status(open,'saved-evidence').requiresKey,false);
assert.equal(status(direct,'generic-jev-decisions').available,true);
assert.equal(status(direct,'generic-jev-decisions').explicitExecuteRequired,true);
assert.equal(status(direct,'generic-jev-decisions').credentialConfigured,true);
assert.equal(status(direct,'legacy-specialized-jev-routing').available,false);
assert.equal(status(open,'legacy-specialized-jev-routing').available,true);
assert.equal(status(direct,'mcp-paid-execution').available,false);
assert.equal(status(direct,'vps-authenticated-deploy').available,false);
assert.equal(status(direct,'telegram-campaign-control').available,false);
assert.throws(()=>offlineCapabilityReport({provider:'custom'}),/Unsupported Jev provider/);

const cli=(script,args,environment={})=>spawnSync(process.execPath,[script,...args],{
 cwd:path.resolve('.'),encoding:'utf8',env:{
  ...process.env,
  YAIS_AI:'',OPENROUTER_API_KEY:'',YAAI_OPENROUTER_API_KEY:'',
  TYPESAFE_API_KEY:'',YAAI_TYPESAFE_API_KEY:'',
  YAAI_JEV_PROVIDER:'',YAAI_JEV_MODEL:'',...environment,
 },
});
const doctor=cli('scripts/jev-provider.mjs',['--provider','typesafe'],
 {TYPESAFE_API_KEY:'should-never-print-this'});
assert.equal(doctor.status,0,doctor.stderr);
const capabilities=JSON.parse(doctor.stdout).capabilities;
assert.equal(capabilities.provider,'typesafe');
assert.equal(status(capabilities,'mcp-paid-execution').available,false);
assert.equal(JSON.parse(doctor.stdout).credentialPresent,true);
assert.doesNotMatch(doctor.stdout,/should-never-print-this/);
const noExecute=cli('scripts/jev-evaluate.mjs',['--prompt-key']);
assert.notEqual(noExecute.status,0);
assert.match(noExecute.stderr,/Add --execute explicitly/);
const notTTY=cli('scripts/jev-evaluate.mjs',[
 '--execute','--prompt-key',
 '--input','/tmp/nonexistent.json','--profile','/tmp/nonexistent-profile.json',
 '--out','/tmp/nonexistent-output.json',
]);
assert.notEqual(notTTY.status,0);
assert.match(notTTY.stderr,/requires a local interactive terminal/);
assert.doesNotMatch(notTTY.stderr,/Bearer|secret/);
console.log('YA AI secret entry + capability doctor selftest: ok (TTY hidden input, cleanup, no-API, no-key disclosure)');
