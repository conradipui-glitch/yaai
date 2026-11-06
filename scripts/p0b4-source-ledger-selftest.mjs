// P0-B.4 source reconciliation quality gate; no network, no paid calls.
// Fail closed on invented source history, wrong case IDs, forged reviewer state.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateP0B4EvidenceLedger,gitBlobSha} from '../lib/p0b4-source-ledger.mjs';

const dataURL=new URL('../playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json',import.meta.url);
const ledgerURL=new URL('../docs/acceptance/P0-B.4-recheck-2026-11-06.json',import.meta.url);
const oldURL=new URL('../docs/acceptance/P0-B.4-source-recheck-events.json',import.meta.url);
const [raw,ledgerRaw,priorRaw]=await Promise.all([
  fs.readFile(dataURL,'utf8'),fs.readFile(ledgerURL,'utf8'),fs.readFile(oldURL,'utf8')
]);
const dataset=JSON.parse(raw),ledger=JSON.parse(ledgerRaw),prior=JSON.parse(priorRaw);
const frozenBlob='1d63569bace42349252f684f44027fc224bb1aca';
assert.equal(gitBlobSha(raw),frozenBlob,'Dataset was silently rewritten after candidate labeling');
const result=validateP0B4EvidenceLedger(ledger,dataset,raw);
assert.equal(result.events,5);
assert.deepEqual(result.byCase,{r03:2,r04:3});
assert.equal(result.accepted,false);
assert.equal(result.originalHtmlCaptured,false);
assert.equal(result.independentHumanReview,'NOT_RUN');
assert.equal(prior.source,'yaai-p0-b4-source-recheck');
assert.equal(prior.reviewGate,'HUMAN_BLIND_REVIEW_PENDING');
assert.equal(prior.records.length,5,'Old source recheck records must not be destroyed');
assert.equal(dataset.cases.length,19,'Blind test data unchanged');
assert.equal(dataset.humanGoldStatus,'unverified_pending_independent_human_review');
const bad=(mutate,pattern)=>{
  const wrong=structuredClone(ledger);
  mutate(wrong);
  assert.throws(()=>validateP0B4EvidenceLedger(wrong,dataset,raw),pattern);
};
bad(x=>{x.datasetGitBlobSha='f'.repeat(40);},/original candidate set changed|integrity mismatch/i);
bad(x=>{x.independentHumanReview='PASSED';},/Independent human review is not complete/);
bad(x=>{x.reviewGate='ACCEPTED';},/Invalid acceptance state/);
bad(x=>{x.records[0].originalObservationIds=['does-not-exist'];},/Unknown original observation link/);
bad(x=>{x.records[0].originalSourceId='not-found';},/Original case\/source\/url/);
bad(x=>{x.records[0].originalUrl='https:\/\/not-the-source.example/';},/Original case\/source\/url/);
bad(x=>{x.records[0].evidenceUrl='file:\/\/\/etc\/passwd';},/Invalid or unsafe source URL/);
bad(x=>{x.records[0].evidenceUrl='https:\/\/another-company.example/';},/another hostname/);
bad(x=>{x.records[0].historicalObservationProved=true;},/cannot verify an earlier original snapshot/);
bad(x=>{x.records[0].rawHtmlSha256='invented';},/Do not invent an HTML digest/);
bad(x=>{x.records[0].httpBodySaved=true;},/No raw HTTP response was saved/);
bad(x=>{x.records[0].retrievedOn='2025-01-01';},/retrieval date/);
bad(x=>{x.records[2].captureSurface='search_index_text';},/Version divergence/);
bad(x=>{x.records[1].eventId=x.records[0].eventId;},/Duplicate\/missing event ID/);
bad(x=>{x.blockingIssues=[];},/original snapshots must remain explicit blockers/);
bad(x=>{x.records[3].evidenceUrl=x.records[3].originalUrl;},/genuinely different URL path/);
bad(x=>{x.records[1].briefParaphrase='';},/Source summary/);
const corruptedDataset=structuredClone(dataset);
corruptedDataset.cases.find(c=>c.id==='r03').observations[1].statement='Fabricated explanation';
assert.throws(()=>validateP0B4EvidenceLedger(ledger,corruptedDataset,raw),/Parsed case data differs/);
const modifiedRaw=raw.replace('Novoslobodskaya','Changed'); // may be absent: guarantee mutation
assert.notEqual(modifiedRaw===raw?raw+' ':modifiedRaw,raw);
assert.throws(()=>validateP0B4EvidenceLedger(ledger,dataset,raw+' '),
  /Parsed case data differs|original candidate set changed/);
const again=validateP0B4EvidenceLedger(structuredClone(ledger),JSON.parse(raw),raw);
assert.deepEqual(result,again,'Same fixed inputs must give reproducible evidence summary');
console.log('P0-B.4 append-only source provenance ledger: PASS');
console.log(JSON.stringify({...result,negativeMutations:19,
  realSourceHtmlSnapshotsRecovered:0,manualHumanReviews:0,externalNetworkCalls:0},null,2));
