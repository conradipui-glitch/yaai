import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const open=createServer();
open.listen(0,'127.0.0.1');
await once(open,'listening');
const port=open.address().port;
await new Promise((resolve,reject)=>open.close(e=>e?reject(e):resolve()));
const child=spawn(process.execPath,['server.mjs'],{
  cwd:process.cwd(),
  env:{...process.env,PORT:String(port),YAAI_LOCAL_API_MAX_CALLS:'2'},
  stdio:['ignore','pipe','pipe'],
});
let logs='';
child.stdout.on('data',chunk=>{logs+=chunk;});
child.stderr.on('data',chunk=>{logs+=chunk;});
const base='http://127.0.0.1:'+port;
async function ready(){
  for(let i=0;i<50;i++){
    if(child.exitCode!==null)throw new Error('Server exited unexpectedly: '+logs);
    try{const r=await fetch(base+'/api/config');if(r.ok)return r.json();}catch{}
    await sleep(100);
  }
  throw new Error('HTTP server did not start: '+logs);
}
try{
  const config=await ready();
  assert.match(config.localRequestToken,/^[a-f0-9]{64}$/);
  assert.equal(config.paidApiBudget.paidRequestsRemaining,2);
  const request=async(headers={})=>fetch(base+'/api/analyze',{
    method:'POST',headers:{'content-type':'application/json',...headers},
    body:'{}',
  });
  const noToken=await request();
  assert.equal(noToken.status,403);
  const evil=await request({'x-yaai-local-token':config.localRequestToken,origin:'http://evil.example'});
  assert.equal(evil.status,403);
  const wrongType=await fetch(base+'/api/analyze',{method:'POST',headers:{
    'content-type':'text/plain','x-yaai-local-token':config.localRequestToken,
  },body:'{}'});
  assert.equal(wrongType.status,415);
  const accepted=await request({'x-yaai-local-token':config.localRequestToken,origin:base});
  assert.equal(accepted.status,400); // reached handler, rejected empty analysis input
  const after=await (await fetch(base+'/api/config')).json();
  assert.equal(after.paidApiBudget.paidAttempts,0);
  console.log('server HTTP guard integration selftest: ok');
}finally{
  child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),sleep(2000)]);
}
