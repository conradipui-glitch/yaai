// Offline P0-B.4 review gate tests. Constructed reviewer records below are
// deliberately synthetic test fixtures — NOT real human judgements.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeBlindPack,makeReviewTemplate,inspectReview,compareReviewed} from '../lib/operator-blind-review.mjs';

const base=new URL('../playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json',import.meta.url);
const raw=await fs.readFile(base,'utf8'),dataset=JSON.parse(raw);
const blind=makeBlindPack(dataset,raw);
assert.equal(blind.cases.length,19);
assert.ok(!JSON.stringify(blind).includes('"referenceDecision"'));
assert.ok(!JSON.stringify(blind).includes('"review"'));
assert.ok(!JSON.stringify(blind).includes('model_authored_case_analysis'));
const template=makeReviewTemplate(blind);
const empty=inspectReview(blind,template);
assert.equal(empty.readyForAdjudication,false);
assert.equal(empty.missing.length,19);
const testReview=structuredClone(template);
testReview.reviewer={
  alias:'TEST ONLY',isHuman:true,independentOfCandidateAuthor:true,
  blindedUntilSubmission:true
}; // Test gate plumbing; never persist as a real human attestation.
testReview.entries=blind.cases.map((c,i)=>{
  const prelim=dataset.cases[i].referenceDecision;
  return {
    caseId:c.id,status:prelim.status,
    evidenceIds:[...prelim.evidenceIds],
    checkedSourceIds:c.origin==='synthetic'?c.sources.map(x=>x.id):c.sources.slice(0,1).map(x=>x.id),
    sourceCheck:c.origin==='synthetic'?'synthetic_only':'checked_saved_paraphrase',
    reason:'Синтетическая проверка формата решения: '+prelim.reason,
    alternativeExplanation:'Вариант объяснения требует отдельной проверки контекста.',
    nextCheck:'Проверить фактическое состояние и сопоставимые источники.',
    proposedAction:prelim.status==='propose_draft'?prelim.proposal:null,
    reviewedAt:'2026-10-29T08:00:00Z'
  };
});
const complete=inspectReview(blind,testReview);
assert.equal(complete.readyForAdjudication,true);
assert.equal(complete.reviewed,19);
const compare=compareReviewed(blind,testReview,dataset,raw);
assert.equal(compare.disagreements.length,0);
assert.ok(compare.note.includes('MODEL-AUTHORED'));
const changed=structuredClone(testReview);
changed.entries[0].status='insufficient_evidence';
changed.entries[0].proposedAction=null;
changed.entries[0].evidenceIds=[];
const disagreed=compareReviewed(blind,changed,dataset,raw);
assert.equal(disagreed.disagreements.length,1);
assert.equal(disagreed.disagreements[0].id,'s01');
const unapproved=structuredClone(testReview);
unapproved.reviewer.isHuman=false;
assert.equal(inspectReview(blind,unapproved).readyForAdjudication,false);
assert.throws(()=>compareReviewed(blind,unapproved,dataset,raw),/attestation/);
const missing=structuredClone(testReview);
missing.entries.pop();
assert.equal(inspectReview(blind,missing).missing.length,1);
assert.throws(()=>compareReviewed(blind,missing,dataset,raw),/Missing review entries/);
const duplicate=structuredClone(testReview);
duplicate.entries.push({...duplicate.entries[0]});
assert.throws(()=>inspectReview(blind,duplicate),/Duplicate review case/);
const wrongEvidence=structuredClone(testReview);
wrongEvidence.entries[0].evidenceIds=['wrong-project-observation'];
assert.throws(()=>inspectReview(blind,wrongEvidence),/unbound observation/);
const wrongSource=structuredClone(testReview);
wrongSource.entries[0].checkedSourceIds=['wrong-project-source'];
assert.throws(()=>inspectReview(blind,wrongSource),/unbound source/);
const falseBrowse=structuredClone(testReview);
falseBrowse.entries[0].sourceCheck='checked_current_page';
assert.throws(()=>inspectReview(blind,falseBrowse),/Synthetic source/);
const unresolved=structuredClone(testReview);
unresolved.entries[1].status='cannot_adjudicate';
unresolved.entries[1].proposedAction=null;
assert.equal(inspectReview(blind,unresolved).readyForAdjudication,false);
assert.throws(()=>compareReviewed(blind,unresolved,dataset,raw),/could not be independently adjudicated/);
const tampered=structuredClone(blind);
tampered.datasetSha256='f'.repeat(64);
assert.throws(()=>compareReviewed(tampered,testReview,dataset,raw),/different candidate dataset/);
const invalidTime=structuredClone(testReview);
invalidTime.entries[0].reviewedAt='invalid';
assert.throws(()=>inspectReview(blind,invalidTime),/review date/);
const missingReason=structuredClone(testReview);
missingReason.entries[0].reason='ok';
assert.throws(()=>inspectReview(blind,missingReason),/No reasoned judgement/);
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'yaai-blind-review-test-'));
try{
  const cli=fileURLToPath(new URL('./operator-blind-review.mjs',import.meta.url));
  const blindPath=path.join(folder,'blind.json'),reviewPath=path.join(folder,'review.json');
  execFileSync(process.execPath,[cli,'prepare','--blind',blindPath,'--template',reviewPath],
    {encoding:'utf8',stdio:'pipe'});
  const out=JSON.parse(await fs.readFile(blindPath,'utf8'));
  assert.deepEqual(out,blind);
  const reviewTemplate=JSON.parse(await fs.readFile(reviewPath,'utf8'));
  assert.equal(reviewTemplate.entries.length,0);
  const verifyEmpty=spawnSync(process.execPath,[cli,'verify','--blind',blindPath,'--review',reviewPath],
    {encoding:'utf8'});
  assert.equal(verifyEmpty.status,2,'Incomplete human review must not pass CLI verification');
  const compareEmpty=spawnSync(process.execPath,[cli,'compare','--blind',blindPath,'--review',reviewPath],
    {encoding:'utf8'});
  assert.equal(compareEmpty.status,1,'Incomplete human review must not allow candidate comparison');
  const noOverwrite=spawnSync(process.execPath,[cli,'prepare','--blind',blindPath,'--template',reviewPath],
    {encoding:'utf8'});
  assert.equal(noOverwrite.status,1,'CLI should not overwrite review files');
  const after=JSON.parse(await fs.readFile(reviewPath,'utf8'));
  assert.deepEqual(after,reviewTemplate);
}finally{await fs.rm(folder,{recursive:true,force:true});}
console.log('P0-B.4 blind review gate: PASS — 19 blinded cases, negative checks, no network');
console.log('Human labels: NOT COLLECTED; P0-B.4 acceptance remains BLOCKED.');
