// P0-B.4 candidate-set provenance/consistency validator — NO model scoring,
// NO claim of independent human adjudication, NO network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { safeConfigId } from '../lib/workspace.mjs';

const root = new URL('../playbooks/operator-local-smb-diagnostic-v0/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const set=JSON.parse(await fs.readFile(new URL('fixtures/p0-b4-reference-candidates.json',root),'utf8'));
const validOrigin=new Set(['synthetic','public_web_paraphrase']);
const validStatuses=new Set(['propose_draft','hold_for_review','insufficient_evidence']);
const validSourceKinds=new Set(['public_site','business_listing','site_http','serp_snippet','wordstat_phrase','public_review','public_response']);
const observedKinds=new Set(manifest.inputContract.kinds);
const ready=(t,m)=>assert.ok(t,m);
function validateScenario(c) {
  ready(c && typeof c==='object','Scenario must be object');
  safeConfigId(c.caseId,'caseId');
  ready(validOrigin.has(c.origin),'Unknown source origin '+c.id);
  ready(c.prospect?.id?.startsWith('firm-') && c.region==='Омск' && c.niche,
    'Missing or mismatched business identity '+c.id);
  ready(manifest.applicability.businessTypes.includes(c.prospect.businessType),
    'Business outside playbook scope '+c.id);
  ready(Array.isArray(c.sources)&&c.sources.length>0,'Sources missing '+c.id);
  ready(Array.isArray(c.observations)&&c.observations.length>0,'Observations missing '+c.id);
  const sourceMap = new Map();
  for(const src of c.sources){
    ready(src.id && !sourceMap.has(src.id),'Duplicate source ID '+c.id+'/'+src.id);
    ready(validSourceKinds.has(src.kind),'Unknown source kind '+c.id+'/'+src.kind);
    ready(Number.isFinite(Date.parse(src.observedAt)),'Invalid date '+c.id+'/'+src.id);
    ready(src.accessStatus && src.summary && src.rightsStatus,'Missing source context '+c.id+'/'+src.id);
    ready(src.origin === (c.origin==='synthetic'?'synthetic':'public_web'),
      'Origin flag mismatch '+c.id+'/'+src.id);
    if(src.origin==='public_web')ready(src.rightsStatus==='public_paraphrase_only',
      'Real sources must not be copied as full texts');
    else ready(src.rightsStatus==='synthetic_test_only','Synthetic rights mismatch');
    if(src.url === null)ready(src.kind==='wordstat_phrase','Missing URL only allowed for saved Wordstat');
    else {
      const u = new URL(src.url);
      ready(['https:','http:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password,
        'Unsafe source URL '+c.id+'/'+src.id);
    }
    sourceMap.set(src.id,src);
  }
  const observations = new Map();
  for(const ob of c.observations){
    ready(ob.id&&!observations.has(ob.id),'Duplicate observation ID '+c.id);
    ready(sourceMap.has(ob.sourceId),'Unbound source '+c.id+'/'+ob.id);
    ready(ob.evidenceType==='observed','Claim masquerades as observed evidence '+c.id+'/'+ob.id);
    ready(ob.statement.length>=12,'Missing observation context '+c.id+'/'+ob.id);
    ready(Number.isFinite(Date.parse(ob.observedAt)),'Invalid observation date '+c.id+'/'+ob.id);
    const src=sourceMap.get(ob.sourceId);
    ready(ob.observedAt===src.observedAt,'Observation date/source snapshot drift '+c.id+'/'+ob.id);
    ready(observedKinds.has(ob.kind),'Unknown observation kind '+c.id+'/'+ob.id);
    ready(ob.kind===src.kind || (src.kind==='public_site'&&ob.kind==='site_content'),
      'Source/observation semantics changed '+c.id+'/'+ob.id);
    observations.set(ob.id,ob);
  }
  const g=c.referenceDecision;
  ready(g && validStatuses.has(g.status),'Unrecognized candidate decision '+c.id);
  ready(Array.isArray(g.evidenceIds),'No evidence trace '+c.id);
  ready(new Set(g.evidenceIds).size===g.evidenceIds.length,'Duplicate cited observation '+c.id);
  for(const id of g.evidenceIds)ready(observations.has(id),'Missing evidence '+c.id+'/'+id);
  ready(g.reason?.length>12&&g.recommendedNextCheck?.length>15,
    'Unexplained candidate decision '+c.id);
  ready(g.alternativeExplanations?.length && g.prohibitedClaims?.length,
    'No contradictions or guardrails '+c.id);
  if(g.status==='propose_draft'){
    ready(g.evidenceIds.length>=2,'Positive candidate needs linked corroborating observations');
    ready(g.proposal?.length>12,'Positive candidate lacks a proposal');
    ready(c.origin==='synthetic','Live-company recommendation needs more than web excerpts + no review');
  } else {
    ready(g.proposal===null,'Do not create an offer without supported decision');
    if(g.status==='insufficient_evidence')ready(g.evidenceIds.length===0,
      'Insufficient finding may not assert supporting evidence');
  }
  ready(c.review.method==='model_authored_case_analysis'&&
    c.review.independentHumanReview==='pending'&&
    c.review.reviewerIdentity===null&&c.review.reviewedAt===null&&
    c.review.verifiedByCi===false,
    'Candidate decisions cannot be presented as independent human review');
  return {sources:sourceMap.size,observations:observations.size};
}
ready(set.schemaVersion===1&&set.source==='yaai-p0-b4-reference-candidate-set','Unexpected set schema');
ready(set.playbook.id===manifest.id && set.playbook.version===manifest.version,
  'Set does not match current PlaybookManifest');
ready(set.iteration==='P0-B.4' && set.humanGoldStatus==='unverified_pending_independent_human_review',
  'Incorrect phase or adjudication status');
ready(set.cases.length>=10&&set.cases.length<=20,'Outside promised P0-B.4 sample size');
const ids = new Set(),casesMap=new Map(),counts={},origins={};
let sourceTotal=0,obsTotal=0;
for(const c of set.cases){
  ready(c.id&&!ids.has(c.id),'Duplicate case ID');
  ids.add(c.id); casesMap.set(c.id,c);
  const x=validateScenario(c);
  sourceTotal+=x.sources;obsTotal+=x.observations;
  counts[c.referenceDecision.status]=(counts[c.referenceDecision.status]||0)+1;
  origins[c.origin]=(origins[c.origin]||0)+1;
  assert.deepEqual(validateScenario(structuredClone(c)),x,'Repeated parse changed decision links');
}
ready(counts.propose_draft>=2&&counts.hold_for_review>=5&&counts.insufficient_evidence>=5,
  'Need representative positive, conflicting and abstaining scenarios');
ready(origins.public_web_paraphrase>=3 && origins.synthetic>=10,'Insufficient source diversity');
const casesSample=structuredClone(set.cases[0]);
casesSample.caseId='../escape';
assert.throws(()=>validateScenario(casesSample),/Invalid caseId/);
const refs=structuredClone(set.cases[0]);
refs.referenceDecision.evidenceIds.push('other-case-source');
assert.throws(()=>validateScenario(refs),/Missing evidence/);
const duplicate=structuredClone(set.cases[0]);
duplicate.sources.push({...duplicate.sources[0]});
assert.throws(()=>validateScenario(duplicate),/Duplicate source ID/);
const badUrl=structuredClone(set.cases[0]);
badUrl.sources[0].url='file:///etc/passwd';
assert.throws(()=>validateScenario(badUrl),/Unsafe source URL/);
const drift=structuredClone(set.cases[0]);
drift.observations[0].observedAt='2020-01-01T00:00:00Z';
assert.throws(()=>validateScenario(drift),/date\/source snapshot drift/);
const allegedHuman=structuredClone(set.cases[0]);
allegedHuman.review.independentHumanReview='passed';
assert.throws(()=>validateScenario(allegedHuman),/independent human review/);
const inventedOffer=structuredClone(casesMap.get('s09'));
inventedOffer.referenceDecision.proposal='Срочно переписать сайт';
assert.throws(()=>validateScenario(inventedOffer),/Do not create an offer/);
const promoted=false; // No independent human adjudication exists in this dataset.
ready(promoted===false,'Candidate set cannot be marked accepted');
console.log('P0-B.4 candidate dataset structural and cross-contract checks: PASS');
console.log(JSON.stringify({count:set.cases.length,origins,decisions:counts,sources:sourceTotal,observations:obsTotal,negativeMutationTests:7,independentHumanReview:'NOT RUN',acceptance:'PENDING_REVIEW',paidCalls:0,siteWrites:0,contactWrites:0},null,2));
