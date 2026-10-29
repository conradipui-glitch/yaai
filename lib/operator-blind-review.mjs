// P0-B.4: pure, offline blind-review contracts. These helpers never certify
// that a real human independently reviewed anything; attestation is self-reported.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const REVIEW_STATES=Object.freeze([
  'propose_draft','hold_for_review','insufficient_evidence','cannot_adjudicate'
]);
const choice=new Set(REVIEW_STATES);
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>v?.[k]!==undefined).map(k=>[k,v[k]]));
const sourceFields=['id','url','kind','summary','publisher','observedAt','region','rightsStatus','accessStatus','origin','captureMethod','sourceScope'];
const observationFields=['id','sourceId','kind','statement','observedAt','evidenceType','entityRole','targetBusinessId','confidenceLimit','eventDate','frequency','frequencyUnit'];

export function sha256(content){
  return createHash('sha256').update(content).digest('hex');
}
export function makeBlindPack(dataset,rawText){
  assert.equal(dataset.source,'yaai-p0-b4-reference-candidate-set');
  assert.equal(dataset.humanGoldStatus,'unverified_pending_independent_human_review');
  assert.ok(Array.isArray(dataset.cases)&&dataset.cases.length>=10);
  assert.equal(typeof rawText,'string');
  const cases=dataset.cases.map(c=>({
    id:c.id,caseId:c.caseId,origin:c.origin,niche:c.niche,region:c.region,
    prospect:pick(c.prospect,['id','name','businessType']),
    sources:c.sources.map(s=>pick(s,sourceFields)),
    observations:c.observations.map(o=>pick(o,observationFields))
  }));
  const result={
    schemaVersion:1,source:'yaai-p0-b4-blind-pack',
    datasetSha256:sha256(rawText),
    playbook:dataset.playbook,
    instructions:'Review from source/observation evidence WITHOUT reading candidate referenceDecision; this pack contains NO expected decisions.',
    decisions:REVIEW_STATES,cases
  };
  const serialized=JSON.stringify(result);
  assert.ok(!serialized.includes('"referenceDecision"')&&!serialized.includes('"review"'),
    'Blind pack leaks source candidate decisions or preliminary review');
  return result;
}
export function makeReviewTemplate(blind){
  assert.equal(blind.source,'yaai-p0-b4-blind-pack');
  return {
    schemaVersion:1,source:'yaai-p0-b4-review-entries',
    datasetSha256:blind.datasetSha256,
    reviewer:{alias:null,isHuman:false,independentOfCandidateAuthor:false,blindedUntilSubmission:false},
    entries:[],
    instructions:'Enter a reasoned independent decision for EACH case with source IDs, evidence IDs, counterpoints and reviewedAt ISO timestamp. Attestation must be truthful. Do not include personal IDs, private accounts, or full copyrighted page text.'
  };
}
function presentText(value){
  return typeof value==='string'&&value.trim().length>=12;
}
export function inspectReview(blind,review,{requireAll=false,requireHuman=false}={}){
  assert.equal(blind?.source,'yaai-p0-b4-blind-pack','Not a blind pack');
  assert.equal(review?.source,'yaai-p0-b4-review-entries','Wrong review format');
  assert.equal(review?.schemaVersion,1,'Review schema version drift');
  assert.equal(review?.datasetSha256,blind.datasetSha256,'Review refers to different candidate dataset');
  assert.ok(Array.isArray(review.entries),'Entries must be an array');
  const cases=new Map(blind.cases.map(c=>[c.id,c]));
  const seen=new Set();
  let cannotAdjudicate=0;
  const distribution={};
  for(const r of review.entries){
    assert.equal(typeof r.caseId,'string','Missing case ID');
    assert.ok(cases.has(r.caseId),'Unknown review case '+r.caseId);
    assert.ok(!seen.has(r.caseId),'Duplicate review case '+r.caseId);
    seen.add(r.caseId);
    assert.ok(choice.has(r.status),'Unknown decision state '+r.caseId);
    assert.ok(presentText(r.reason),'No reasoned judgement '+r.caseId);
    assert.ok(presentText(r.alternativeExplanation),'No alternate explanation '+r.caseId);
    assert.ok(presentText(r.nextCheck),'Missing next check '+r.caseId);
    assert.ok(Number.isFinite(Date.parse(r.reviewedAt)),'Missing/invalid review date '+r.caseId);
    assert.ok(Array.isArray(r.evidenceIds),'Missing evidence IDs '+r.caseId);
    assert.ok(new Set(r.evidenceIds).size===r.evidenceIds.length,'Duplicate evidence IDs '+r.caseId);
    const ids=new Set(cases.get(r.caseId).observations.map(x=>x.id));
    for(const id of r.evidenceIds)assert.ok(ids.has(id),'Cross-case/unbound observation '+r.caseId+'/'+id);
    assert.ok(Array.isArray(r.checkedSourceIds),'Missing checked source IDs '+r.caseId);
    assert.ok(new Set(r.checkedSourceIds).size===r.checkedSourceIds.length,'Duplicate checked source IDs '+r.caseId);
    const sourceIds=new Set(cases.get(r.caseId).sources.map(x=>x.id));
    for(const id of r.checkedSourceIds)assert.ok(sourceIds.has(id),'Cross-case/unbound source '+r.caseId+'/'+id);
    assert.ok(['checked_current_page','checked_saved_paraphrase','synthetic_only','unavailable'].includes(r.sourceCheck),
      'Missing source verification mode '+r.caseId);
    if(cases.get(r.caseId).origin==='public_web_paraphrase')
      assert.notEqual(r.sourceCheck,'synthetic_only','Live case cannot be marked synthetic '+r.caseId);
    if(cases.get(r.caseId).origin==='synthetic')
      assert.equal(r.sourceCheck,'synthetic_only','Synthetic source cannot be represented as real browsing '+r.caseId);
    if(r.sourceCheck==='checked_current_page') assert.ok(r.checkedSourceIds.length>0,
      'Claimed page check has no source id '+r.caseId);
    if(r.status==='propose_draft'){
      assert.ok(r.evidenceIds.length>0,'Positive review requires evidence '+r.caseId);
      assert.ok(presentText(r.proposedAction),'Positive review has no bounded action '+r.caseId);
    } else assert.ok(r.proposedAction==null||r.proposedAction==='',
      'Do not write offer for rejected/pending candidate '+r.caseId);
    if(r.status==='cannot_adjudicate')cannotAdjudicate++;
    distribution[r.status]=(distribution[r.status]||0)+1;
  }
  const missing=blind.cases.map(c=>c.id).filter(id=>!seen.has(id));
  const hasHumanAttestation=review.reviewer?.isHuman===true &&
    review.reviewer?.independentOfCandidateAuthor===true &&
    review.reviewer?.blindedUntilSubmission===true &&
    typeof review.reviewer.alias==='string' && review.reviewer.alias.trim().length>=2;
  const complete=missing.length===0 && cannotAdjudicate===0 &&
    hasHumanAttestation;
  if(requireAll)assert.equal(missing.length,0,'Missing review entries: '+missing.join(','));
  if(requireAll)assert.equal(cannotAdjudicate,0,'Some cases could not be independently adjudicated');
  if(requireHuman)assert.ok(hasHumanAttestation,'Real independent blind human attestation required');
  return {
    candidateCount:blind.cases.length,reviewed:seen.size,
    missing,cannotAdjudicate,distribution,
    humanAttestation:'self_reported_only',attested:hasHumanAttestation,
    readyForAdjudication:complete
  };
}
export function compareReviewed(blind,review,dataset,rawText){
  const stat=inspectReview(blind,review,{requireAll:true,requireHuman:true});
  assert.ok(stat.readyForAdjudication,'Blind review incomplete / unresolved');
  assert.equal(sha256(rawText),blind.datasetSha256,'Original candidate dataset has changed');
  assert.equal(dataset.cases.length,blind.cases.length,'Dataset length drift');
  const byId=new Map(dataset.cases.map(c=>[c.id,c]));
  const differences=[];
  for(const entry of review.entries){
    const gold=byId.get(entry.caseId);
    assert.ok(gold,'Missing candidate comparison item');
    if(gold.referenceDecision.status!==entry.status){
      differences.push({id:entry.caseId,reviewedStatus:entry.status,candidateStatus:gold.referenceDecision.status});
    }
  }
  return {
    source:'yaai-p0-b4-review-comparison',datasetSha256:blind.datasetSha256,
    reviewed:stat.reviewed,
    agreements:stat.reviewed-differences.length,disagreements:differences,
    note:'Agreement with MODEL-AUTHORED candidate decisions is NOT model accuracy or independent verification of source truth. Reviewer attestation is self-reported; conflicts require adjudication. No review entries are committed to the repository automatically.'
  };
}
