import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {KNOWLEDGE_RULE_VERSION,KNOWLEDGE_TOPICS} from '../public/knowledge-content.js';
import {calculateKnowledgeExample} from '../public/knowledge-metrics.js';
import {evaluateMetricSnapshot} from '../lib/metric-rules.mjs';

const src=await fs.readFile('lib/metric-rules.mjs');
const pin=JSON.parse(await fs.readFile('docs/knowledge-metrics-source.json','utf8'));
assert.equal(pin.schemaVersion,1);
assert.equal(pin.engineModule,'lib/metric-rules.mjs');
const hash=createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');
assert.equal(hash,pin.engineGitBlobSha1,
  'Metric rules changed: REVIEW educational CTR/CVR text, thresholds and calculator BEFORE updating docs/knowledge-metrics-source.json');
assert.equal(KNOWLEDGE_RULE_VERSION,pin.rulesVersion);
assert.match(src.toString('utf8'),/ad-metrics-weekly-v1/);
assert.deepEqual(Object.keys(KNOWLEDGE_TOPICS).sort(),['ctr','cvr']);
for(const topic of Object.values(KNOWLEDGE_TOPICS)){
  assert.ok(['ctr','cvr'].includes(topic.id));
  for(const key of ['title','short','formula','plain','mechanism','business','rule','caveat','pitfall']){
    const minimum=['title','formula'].includes(key)?5:20;
    assert.ok(typeof topic[key]==='string'&&topic[key].length>=minimum,topic.id+': '+key);
  }
  assert.ok(topic.related.length>0);
  assert.ok(topic.related.every(id=>Object.hasOwn(KNOWLEDGE_TOPICS,id)));
}
assert.match(KNOWLEDGE_TOPICS.ctr.rule,/30%/);
assert.match(KNOWLEDGE_TOPICS.ctr.rule,/1 000/);
assert.match(KNOWLEDGE_TOPICS.ctr.rule,/95%/);
assert.match(KNOWLEDGE_TOPICS.cvr.rule,/40%/);
assert.match(KNOWLEDGE_TOPICS.cvr.rule,/150/);
assert.match(KNOWLEDGE_TOPICS.cvr.rule,/20 конверсиях/);
assert.match(KNOWLEDGE_TOPICS.cvr.caveat,/спустя несколько дней/);

const baseline={
  impressions:10000,clicks:1000,conversions:150,
  startDate:'2026-09-28',endDate:'2026-10-04',
  spendRub:10000,complete:true,conversionsFinalized:true,
};
const current={
  impressions:10000,clicks:300,conversions:9,
  startDate:'2026-10-05',endDate:'2026-10-11',
  spendRub:16500,complete:true,conversionsFinalized:true,
};
const sample=calculateKnowledgeExample({baseline,current});
assert.equal(sample.baseline.ctr,0.1);
assert.equal(sample.baseline.cvr,0.15);
assert.equal(sample.current.ctr,0.03);
assert.equal(sample.current.cvr,0.03);
assert.ok(Math.abs(sample.ctrRelativeChange+0.7)<1e-10);
assert.ok(Math.abs(sample.cvrRelativeChange+0.8)<1e-10);
const actual=evaluateMetricSnapshot({
 schemaVersion:1,caseId:'demo',campaignId:'one',currency:'RUB',
 source:'manual-export',periods:{baseline,current},
},'demo');
assert.equal(actual.rulesVersion,KNOWLEDGE_RULE_VERSION);
assert.equal(actual.findings.filter(x=>x.type==='metric_ctr_drop').length,1);
assert.equal(actual.findings.filter(x=>x.type==='metric_conversion_rate_drop').length,1);
assert.equal(actual.findings.find(x=>x.type==='metric_ctr_drop').evidence.baselineCTR,sample.baseline.ctr);
assert.equal(actual.findings.find(x=>x.type==='metric_ctr_drop').evidence.currentCTR,sample.current.ctr);
assert.equal(actual.findings.find(x=>x.type==='metric_conversion_rate_drop').evidence.baselineCVR,sample.baseline.cvr);
assert.equal(actual.findings.find(x=>x.type==='metric_conversion_rate_drop').evidence.currentCVR,sample.current.cvr);
assert.match(sample.note,/Не оценивает.*статистическую значимость/);
const noEvents=calculateKnowledgeExample({baseline:{impressions:0,clicks:0,conversions:0},current:{
  impressions:10,clicks:0,conversions:0,
}});
assert.equal(noEvents.baseline.ctr,null);
assert.equal(noEvents.baseline.cvr,null);
assert.equal(noEvents.current.cvr,null);
assert.equal(noEvents.ctrRelativeChange,null);
assert.throws(()=>calculateKnowledgeExample({baseline:{...baseline,impressions:30},current}),/Кликов не может/);
assert.throws(()=>calculateKnowledgeExample({baseline,current:{...current,conversions:301}}),/Конверсий не может/);
assert.throws(()=>calculateKnowledgeExample({baseline,current:{...current,clicks:-1}}),/целое неотрицательное/);
assert.throws(()=>calculateKnowledgeExample({baseline,current:{...current,clicks:1.5}}),/целое неотрицательное/);
assert.throws(()=>calculateKnowledgeExample({baseline,current:{...current,clicks:Infinity}}),/целое неотрицательное/);
assert.throws(()=>calculateKnowledgeExample({baseline,current:{...current,clicks:1000000001}}),/целое неотрицательное/);

const html=await fs.readFile('public/index.html','utf8');
const style=await fs.readFile('public/knowledge-layer.css','utf8');
const ui=await fs.readFile('public/knowledge-layer.js','utf8');
const main=await fs.readFile('public/app.js','utf8');
const data=await fs.readFile('public/knowledge-content.js','utf8');
assert.match(html,/href="\/knowledge-layer\.css"/);
assert.match(main,/import \{setupKnowledgeLayer\} from '\.\/knowledge-layer\.js'/);
assert.match(main,/setupKnowledgeLayer\(\)/);
assert.match(html,/id="knowledgeDrawer".*role="dialog" aria-modal="true"/s);
assert.match(html,/id="knowledgeExampleResult".*aria-live="polite"/s);
assert.match(ui,/e\.key==='Escape'/);
assert.match(ui,/e\.key!=='Tab'/);
assert.match(ui,/previousFocus\.focus\(\)/);
assert.match(style,/@media\(max-width:600px\)/);
assert.match(ui,/textContent/,'render educational material as text, not HTML');
assert.doesNotMatch(ui,/fetch\s*\(|XMLHttpRequest\s*\(/);
assert.doesNotMatch(data,/fetch\s*\(|XMLHttpRequest\s*\(/);
for(const id of [
 'knowledgeDrawer','knowledgeBackdrop','knowledgeClose','knowledge-rule-version',
 'knowledgeExampleResult','knowledgeReset',
 'knowledge-baseline-impressions','knowledge-baseline-clicks',
 'knowledge-baseline-conversions','knowledge-current-impressions',
 'knowledge-current-clicks','knowledge-current-conversions',
]){
  assert.ok(html.includes('id="'+id+'"'),id);
}
for(const key of ['title','short','formula','plain','mechanism','business','rule','caveat','pitfall'])
  assert.ok(html.includes('id="knowledge-'+key+'"'),key);
for(const topic of ['ctr','cvr'])
  assert.ok(html.includes('data-knowledge="'+topic+'"'),topic);
console.log('YA AI Knowledge Layer selftest: ok (source hash drift gate, teaching/execution arithmetic parity, offline drawer, accessibility and safe input)');
