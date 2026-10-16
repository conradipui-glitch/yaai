import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { buildPainEvidenceItems, buildPainMap } from '../lib/pain-discovery.mjs';
import { buildPainReportDocument } from '../lib/evidence-report.mjs';
import { studioPainReport } from '../lib/studio-pain-report.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-studio-pain-'));
let child = null;
const files = {
  alpha: path.join(root,'results','alpha','pain-report.json'),
  beta: path.join(root,'results','beta','pain-report.json'),
};

const wordstat = {generatedAt:'2026-10-09T01:00:00Z',rows:[
  {phrase:'теряются заявки клиентов',count:129,regionName:'Омск',types:['top']},
  {phrase:'дорогие заявки стоимость',count:null,regionName:'Омск',types:['top']},
]};
const serp = {generatedAt:'2026-10-09T01:30:00Z',region:'11318',queries:[
  {query:'потеря заявок',results:[
    {position:1,url:'https://source.example/forum',title:'Жалоба',
      passage:'Наши заявки теряются. </script><img src=x onerror=alert(1)>'},
    {position:2,url:'https://vendor.example/pr',title:'Продажи',
      passage:'Купите наш продукт, он решает все проблемы.'},
  ]},
]};
const items = buildPainEvidenceItems({topic:'обработка заявок',wordstat,serp,limit:10});
const evaluations = {
  summary:{totalCost:null,measuredCostSubtotal:0.00003,missingCostCount:1},
  evaluations:items.map((item,i)=>({
    itemId:item.id,
    answers:{
      pain_present:{value:i===3?0.15:0.94},
      pain_type:{value:i===1?'high_cost':i===3?'none':'lost_opportunities',certainty:0.91},
      voice:{value:i===2?'first_person':'question'},
      solution_intent:{value:0.2},
    },
    route:{needsReview:i===0},
    usage:{cost:i===2?null:0.00001},
  })),
};
const map = buildPainMap({topic:'обработка заявок',evidenceItems:items,evaluations,wordstat,serp});
const report = buildPainReportDocument(map);

async function waitForServer(base, logs) {
  for (let i=0; i<50; i++) {
    if (child.exitCode !== null) throw Error('Server exited: ' + logs());
    try {
      const response = await fetch(base+'/api/config');
      if (response.ok) return;
    } catch { /* retry until ready */ }
    await sleep(100);
  }
  throw Error('Server did not start: ' + logs());
}

try {
  await fs.mkdir(path.join(root,'cases'));
  await fs.mkdir(path.join(root,'results','alpha'),{recursive:true});
  for (const id of ['alpha','beta']) {
    await fs.writeFile(path.join(root,'cases',id+'.json'),JSON.stringify({id,name:'Проект '+id}));
  }
  const empty = await studioPainReport({workspaceRoot:root,caseId:'alpha'});
  assert.equal(empty.status,'no_report');
  assert.equal(empty.expectedRelativePath,'results/alpha/pain-report.json');
  await fs.writeFile(files.alpha,JSON.stringify(report));
  const selected = await studioPainReport({workspaceRoot:root,caseId:'alpha'});
  assert.equal(selected.status,'ready');
  assert.equal(selected.caseId,'alpha');
  assert.equal(selected.report.summary.assessedObservations,4);
  assert.equal(selected.report.summary.modelAccepted,3);
  assert.equal(selected.report.summary.modelRejected,1);
  assert.equal(selected.report.claims.length,2);
  assert.equal(selected.report.evidence.length,3);
  assert.equal(selected.report.qualityStatus,'not_provided');
  assert.ok(selected.report.claims.every(c=>c.status==='hypothesis_requires_validation'));
  assert.ok(selected.report.evidence.some(e=>e.url==='https://source.example/forum'));
  assert.equal('policy' in selected.report,false);
  assert.equal('observations' in selected.report,false);
  assert.equal((await studioPainReport({workspaceRoot:root,caseId:'beta'})).status,'no_report');
  await assert.rejects(studioPainReport({workspaceRoot:root,caseId:'../alpha'}),/неверный идентификатор/);
  await assert.rejects(studioPainReport({workspaceRoot:root,caseId:'unknown'}),/ENOENT/);

  const corrupted = JSON.parse(JSON.stringify(report));
  corrupted.claims[0].evidenceIds[0]='pain:00000000000000000000';
  await fs.writeFile(files.alpha,JSON.stringify(corrupted));
  await assert.rejects(studioPainReport({workspaceRoot:root,caseId:'alpha'}),/неподходящее свидетельство/);
  const fakeSummary = JSON.parse(JSON.stringify(report));
  fakeSummary.summary.modelAccepted = 99;
  await fs.writeFile(files.alpha,JSON.stringify(fakeSummary));
  await assert.rejects(studioPainReport({workspaceRoot:root,caseId:'alpha'}),/счётчики/);
  const injection = JSON.parse(JSON.stringify(report));
  const serpObservation = injection.observations.find(row=>row.kind==='serp_snippet' && row.accepted);
  serpObservation.url='javascript:alert(1)';
  await fs.writeFile(files.alpha,JSON.stringify(injection));
  await assert.rejects(studioPainReport({workspaceRoot:root,caseId:'alpha'}),/запрещённая ссылка/);
  await fs.writeFile(files.alpha,JSON.stringify(report));
  await fs.symlink(path.join(root,'results','alpha'),path.join(root,'results','beta'));
  await assert.rejects(studioPainReport({workspaceRoot:root,caseId:'beta'}),/небезопасная папка/);

  const js=await fs.readFile('public/studio-pain.js','utf8');
  const html=await fs.readFile('public/studio.html','utf8');
  assert.match(html,/lang="ru"/);
  assert.match(js,/textContent/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.match(html,/id="pain-links"/);
  assert.match(html,/id="pain-claims"/);
  assert.match(html,/id="pain-evidence"/);

  const open = createServer();
  open.listen(0,'127.0.0.1');
  await once(open,'listening');
  const port = open.address().port;
  await new Promise((resolve,reject)=>open.close(error=>error?reject(error):resolve()));
  child = spawn(process.execPath,['server.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),YAAI_WORKSPACE:root},
    stdio:['ignore','pipe','pipe'],
  });
  let logs='';
  child.stdout.on('data',d=>{logs+=d.toString();});
  child.stderr.on('data',d=>{logs+=d.toString();});
  const base='http://127.0.0.1:'+port;
  await waitForServer(base,()=>logs);
  const goodResponse=await fetch(base+'/api/studio/pain-report?case=alpha');
  assert.equal(goodResponse.status,200);
  const good=await goodResponse.json();
  assert.equal(good.status,'ready');
  assert.equal(good.report.claims.length,2);
  assert.equal(good.report.summary.modelAccepted,3);
  assert.equal(good.report.evidence.length,3);
  assert.equal((await (await fetch(base+'/api/studio/pain-report?case=beta')).json()).status,'no_report');
  assert.equal((await fetch(base+'/api/studio/pain-report?case=..%2Falpha')).status,400);
  const noCase=await fetch(base+'/api/studio/pain-report');
  assert.equal(noCase.status,400);
  const deniedHost=await fetch(base+'/api/studio/pain-report?case=alpha',{headers:{Host:'example.com'}});
  assert.equal(deniedHost.status,403);
  const after=await (await fetch(base+'/api/config')).json();
  assert.equal(after.paidApiBudget.paidAttempts,0);
  console.log('Studio saved Pain Discovery: good report, scoped access, tamper/URL/symlink rejection, local HTTP and zero paid calls: ok');
} finally {
  if (child) {
    child.kill('SIGTERM');
    await Promise.race([once(child,'exit'),sleep(2000)]);
  }
  await fs.rm(root,{recursive:true,force:true});
}
