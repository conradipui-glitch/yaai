import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSeoReport, renderSeoReportHtml } from './render-seo-report.mjs';

const original={generatedAt:'2026-10-09T00:00:00Z',rowCount:2,
  regions:[{id:'1',name:'Тест'}],seeds:['калькулятор'],
  calls:[{seed:'калькулятор',region:{id:'1',name:'Тест'}}],
  rows:[
    {phrase:'калькулятор строительных работ',regionId:'1',regionName:'Тест',count:12,types:['top'],seeds:['калькулятор']},
    {phrase:'<script>alert(1)</script>',regionId:'1',regionName:'Тест',count:null,types:['association'],seeds:['калькулятор']}
  ]};
const analysis={source:{generatedAt:original.generatedAt,rawRows:2,regions:original.regions,seeds:original.seeds},
  meta:{presetId:'test',presetName:'Калькулятор <img src=x onerror=alert(1)>',inputRows:2,eligibleRows:1,
    assignedRows:1,unassignedRows:0,negativeRows:0},
  summary:[],classifiedRows:[{...original.rows[0],queryType:'informational',nextAction:'guide',intentTitle:'Расчёт'}]};
const planner={meta:{presetId:'test',inputClassifiedRows:1,pageCandidates:1},
  pages:[{title:'Калькулятор',path:'/calc/',decision:'create',maxCount:12,
    strongestPhrase:'калькулятор строительных работ',strongestRegion:'Тест',
    regions:[{regionName:'Тест',maxCount:12}]}],holdRows:[]};
const report=buildSeoReport(original,analysis,planner);
assert.equal(report.summary.rawRows,2);
assert.equal(report.summary.topRows,1);
assert.equal(report.summary.pages,1);
assert.equal(report.queries.length,1);
assert.ok(!JSON.stringify(report).includes('folderId'));
const html=renderSeoReportHtml(report);
assert.match(html,/lang="ru"/);
assert.match(html,/id="queryRows"/);
assert.match(html,/id="export"/);
assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(html,/<img src=x onerror=/);
const inline=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline);
new vm.Script(inline[1]);
assert.throws(()=>buildSeoReport({...original,rowCount:3},analysis,planner),/integrity/);
assert.throws(()=>buildSeoReport(original,{...analysis,source:{...analysis.source,generatedAt:'wrong'}},planner),/integrity/);
assert.throws(()=>buildSeoReport(original,analysis,{...planner,meta:{...planner.meta,presetId:'wrong'}}),/integrity/);
assert.throws(()=>buildSeoReport(original,{...analysis,classifiedRows:[{...analysis.classifiedRows[0],count:14}]},planner),/integrity/);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-seo-report-'));
try{
  const files=['source','analysis','plan'].map(x=>path.join(dir,x+'.json'));
  await Promise.all(files.map((f,i)=>fs.writeFile(f,JSON.stringify([original,analysis,planner][i]))));
  const dest=path.join(dir,'report.html');
  const cli=[fileURLToPath(new URL('./render-seo-report.mjs',import.meta.url)),
    '--wordstat',files[0],'--intents',files[1],'--plan',files[2],'--html',dest];
  const run=spawnSync(process.execPath,cli,{encoding:'utf8',env:{...process.env,
    YANDEX_API_KEY:'',OPENROUTER_API_KEY:'',YAIS_AI:''}});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/"paidApiCalls": 0/);
  const output=JSON.parse(await fs.readFile(path.join(dir,'report.json'),'utf8'));
  assert.equal(output.schema,'yaai-seo-evidence-report');
  assert.equal(output.summary.pages,1);
  assert.match(await fs.readFile(dest,'utf8'),/Wordstat/);
  const repeat=spawnSync(process.execPath,cli,{encoding:'utf8'});
  assert.notEqual(repeat.status,0);
  assert.match(repeat.stderr,/Output exists/);
}finally{await fs.rm(dir,{recursive:true,force:true});}
console.log('SEO report selftest: ok (offline CLI, evidence binding, no overwrite, escaping, browser JS syntax)');
