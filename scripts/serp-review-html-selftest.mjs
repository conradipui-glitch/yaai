import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderSerpReviewHtml } from './serp-review-html.mjs';
import { csvString, parseCsv } from './serp-relevance-benchmark.mjs';

const malicious='</script><img src=x onerror="alert(1)">';
const columns=['id','query','title','excerpt','url','gold_relevance','gold_useful_signal','reviewer_note'];
const rows=[
  {id:'first',query:'дорогой лиде',title:'CPL и стоимость лидов',
    excerpt:'Реклама, стоимость заявки и CPL '+malicious,
    url:'https://example.test/lead-cost',gold_relevance:'',
    gold_useful_signal:'',reviewer_note:''},
  {id:'second',query:'с днем рождения Лида',title:'Открытки',
    excerpt:'Поздравления по случаю дня рождения',
    url:'https://example.test/greetings',gold_relevance:'',
    gold_useful_signal:'',reviewer_note:''},
];
const html=renderSerpReviewHtml(rows,{topic:'обработка заявок'});
assert.match(html,/<!doctype html>/i);
assert.match(html,/lang="ru"/);
assert.match(html,/id="rows-json"/);
assert.match(html,/Сохранить ответы в CSV/);
assert.match(html,/Загрузить CSV/);
assert.match(html,/клавиша 1/i);
assert.match(html,/new Blob/);
assert.match(html,/aria-pressed/);
assert.match(html,/id="progress-num"/);
assert.match(html,/@media\(max-width:700px\)/);
assert.doesNotMatch(html,/<img src=x onerror/);
assert.doesNotMatch(html,/<script><img/);
assert.ok(html.includes(String.raw`\u003c`));
assert.match(html,/CPL и стоимость лидов/);
assert.doesNotMatch(html,/"decision":"exclude"/);
assert.doesNotMatch(html,/"reason":"off-topic-query-/);
assert.throws(()=>renderSerpReviewHtml([rows[0],rows[0]]),/duplicate/);
assert.throws(()=>renderSerpReviewHtml([{...rows[0],url:'javascript:bad'}]),/URL/);
assert.throws(()=>renderSerpReviewHtml([{...rows[0],gold_relevance:'irrelevant',
  gold_useful_signal:'yes'}]),/needs relevant/);

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-serp-review-html-'));
try{
 const source=path.join(tmp,'pilot.blind.csv');
 const destination=path.join(tmp,'pilot.review.html');
 await fs.writeFile(source,csvString([columns,...rows.map(r=>columns.map(h=>r[h]))]));
 const run=()=>spawnSync(process.execPath,[
   'scripts/serp-review-html.mjs','--blind',source,'--html',destination,
 ],{cwd:path.resolve('.'),encoding:'utf8',
    env:{...process.env,YAIS_AI:'',OPENROUTER_API_KEY:''}});
 const result=run();
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/"paidApiCalls": 0/);
 const local=await fs.readFile(destination,'utf8');
 assert.match(local,/example.test\/lead-cost/);
 assert.doesNotMatch(local,/<img src=x onerror/);
 const retry=run();
 assert.notEqual(retry.status,0,'existing reports must not be silently overwritten');
 const parsed=parseCsv(await fs.readFile(source,'utf8'));
 assert.equal(parsed.length,3);
}finally{await fs.rm(tmp,{recursive:true,force:true});}
console.log('SERP offline blind review HTML selftest: ok (no predictions, escaped evidence, safe file guards, no API)');
