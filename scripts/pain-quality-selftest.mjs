import assert from 'node:assert/strict';
import { preparePainReview, evaluatePainQuality, painQualityMarkdown, painMapFingerprint } from '../lib/pain-quality.mjs';

const outcomes=[
  {pred:true,truth:true,category:'time_loss',gold:'time_loss',supported:true},
  {pred:true,truth:false,category:'high_cost',gold:null,supported:false},
  {pred:false,truth:true,category:'none',gold:'complexity',supported:true},
  {pred:false,truth:false,category:'none',gold:null,supported:false},
  {pred:true,truth:true,category:'poor_quality',gold:'unreliable',supported:false},
  {pred:false,truth:false,category:'none',gold:null,supported:false},
];
const ledger=Array.from({length:12},(_,i)=>{
  const outcome=outcomes[i%6];
  return {
    id:'pain:test-'+String(i+1),
    kind:i%2===0?'wordstat_phrase':'serp_snippet',
    query:'example '+i,title:'Research evidence',
    excerpt:'Illustrative evidence '+i,
    url:i%2===0?null:'https://example.test/'+i,region:'225',
    observedCount:i%2===0?100:null,
    classification:{
      evidenceId:'pain:test-'+String(i+1),
      accepted:outcome.pred,category:outcome.category,
      modelCostUsd:0.01,needsReview:false,
    },
  };
});
const map={schemaVersion:1,source:'yaai-pain-discovery',topic:'test pains',
  generatedAt:'2026-10-08T00:00:00Z',evidenceLedger:ledger};
const fingerprint=painMapFingerprint(map);
assert.match(fingerprint,/^[0-9a-f]{64}$/);
const queue=preparePainReview(map,{sampleSize:12});
assert.equal(queue.items.length,12);
assert.equal(queue.mapFingerprint,fingerprint);
assert.equal(queue.sampling.populationCount,12);
assert.equal(queue.items[0].label.isPain,null);
assert.equal('classification' in queue.items[0].evidence,false);
assert.equal('prediction' in queue.items[0],false);
assert.ok(queue.sampling.countsByStratum['wordstat_phrase:predicted-pain']);
assert.ok(queue.sampling.countsByStratum['serp_snippet:predicted-not-pain']);

const empty=evaluatePainQuality(map,queue,{targetLabels:10});
assert.equal(empty.status,'insufficient_manual_labels');
assert.equal(empty.sample.labeled,0);
assert.equal(empty.metrics.painPrecision,null);
assert.equal(empty.metrics.painRecall,null);
assert.equal(empty.metrics.validatedEvidenceCoverage,null);
assert.equal(empty.metrics.costPerValidatedTruePositiveUsd,null);
assert.equal(empty.metrics.costPerHumanPositiveUsd,null);
assert.equal(empty.metrics.costPerSourceSupportedTruePositiveUsd,null);
assert.match(painQualityMarkdown(empty),/нет данных/);

for (const item of queue.items) {
  const i=Number(item.id.split('-')[1])-1;
  const expected=outcomes[i%6];
  item.label={
    isPain:expected.truth,category:expected.gold,
    evidenceSupported:expected.supported,reviewer:'fixture-only',
    notes:'Synthetic test label, not a real human annotation',
  };
}

const result=evaluatePainQuality(map,queue,{targetLabels:10});
assert.equal(result.status,'provisional_human_benchmark');
assert.deepEqual(result.confusion,{truePositive:4,falsePositive:2,trueNegative:4,falseNegative:2});
assert.equal(result.sample.labeled,12);
assert.equal(result.metrics.painPrecision,0.6667);
assert.equal(result.metrics.painRecall,0.6667);
assert.equal(result.metrics.categoryAccuracyOnTruePositive,0.5);
assert.equal(result.metrics.validatedEvidenceCoverage,0.3333);
assert.equal(result.metrics.reviewedJevCostUsd,0.12);
assert.equal(result.metrics.costPerHumanPositiveUsd,0.03);
assert.equal(result.metrics.sourceSupportedTruePositiveCount,2);
assert.equal(result.metrics.costPerSourceSupportedTruePositiveUsd,0.06);
assert.equal(result.metrics.costPerValidatedTruePositiveUsd,0.06);
assert.equal(result.discrepancies.length,6);
assert.equal(result.sources.wordstat_phrase.reviewed,6);
assert.equal(result.sources.serp_snippet.reviewed,6);
assert.match(painQualityMarkdown(result),/66.7%/);
assert.ok(result.limitations.some(s=>s.includes('Yandex API costs')));

const tampered={...map,evidenceLedger:[...map.evidenceLedger]};
tampered.evidenceLedger[0]={...tampered.evidenceLedger[0],excerpt:'modified'};
assert.throws(()=>evaluatePainQuality(tampered,queue),/different or modified/);
assert.throws(()=>preparePainReview({source:'yaai-pain-discovery',evidenceLedger:null}),/evidenceLedger/);
const duplicated={...queue,items:[queue.items[0],queue.items[0]]};
assert.throws(()=>evaluatePainQuality(map,duplicated),/Duplicate review/);
const bad=structuredClone(queue);
bad.items[0].label.reviewer='';
assert.throws(()=>evaluatePainQuality(map,bad),/human reviewer/);
const partial=structuredClone(queue);
partial.items[0].label.isPain=null;
const partialResult=evaluatePainQuality(map,partial,{targetLabels:12});
assert.equal(partialResult.status,'insufficient_manual_labels');
assert.equal(partialResult.sample.pending,1);
assert.equal(partialResult.sample.labeled,11);

console.log('pain quality selftest: ok (all labels synthetic fixtures)');
