// P0-B.4 verification evidence ledger: standalone offline checks.
// This is NOT a source fetcher, a certified archive, or independent human review.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeBlindPack, inspectReview, makeReviewTemplate} from './operator-blind-review.mjs';

export function gitBlobSha(raw){
  assert.equal(typeof raw,'string','Source dataset must be a UTF-8 string');
  return createHash('sha1')
    .update('blob '+Buffer.byteLength(raw,'utf8')+'\0')
    .update(raw,'utf8').digest('hex');
}
const classes=new Set([
  'later_text_corrobates_wording',
  'alternative_context_not_same_page',
  'different_cached_version',
  'different_url_same_business'
]);
const surfaces=new Set(['search_index_text','cached_page_text']);
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  !Number.isNaN(Date.parse(x+'T00:00:00Z'));
const nonEmpty=x=>typeof x==='string'&&x.trim().length>=25;
const safeURL=text=>{
  assert.equal(typeof text,'string','Source URL missing');
  const url=new URL(text);
  assert.ok(['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password,
    'Invalid or unsafe source URL');
  return url;
};
const allowedCases=new Set(['r03','r04']);
export function validateP0B4EvidenceLedger(ledger,dataset,rawDataset){
  assert.equal(ledger?.source,'yaai-p0-b4-public-source-recheck-ledger','Wrong ledger type');
  assert.equal(ledger.schemaVersion,1,'Wrong ledger schema');
  assert.equal(ledger.iteration,'P0-B.4','Wrong iteration');
  assert.equal(ledger.authorRole,'AI_assisted_research_not_independent_human',
    'Do not present assistant review as a human review');
  assert.equal(ledger.independentHumanReview,'NOT_RUN','Independent human review is not complete');
  assert.equal(ledger.reviewGate,'INDEPENDENT_HUMAN_ADJUDICATION_PENDING',
    'Invalid acceptance state');
  assert.equal(ledger.nextPhase,'P0-B.4_ONLY','Stage jump blocked');
  assert.deepEqual(dataset,JSON.parse(rawDataset),
    'Parsed case data differs from original immutable candidate bytes');
  assert.equal(ledger.datasetGitBlobSha,gitBlobSha(rawDataset),
    'Original candidate set changed: historical source integrity mismatch');
  assert.equal(dataset.source,'yaai-p0-b4-reference-candidate-set');
  assert.equal(dataset.iteration,'P0-B.4');
  assert.equal(dataset.humanGoldStatus,'unverified_pending_independent_human_review');
  assert.ok(validDate(ledger.reviewDate)&&ledger.reviewDate>=ledger.firstSourceObservationDate);
  assert.equal(ledger.firstSourceObservationDate,'2026-10-29');
  assert.ok(nonEmpty(ledger.recordPolicy),'No append-only provenance policy');
  assert.ok(Array.isArray(ledger.records)&&ledger.records.length===5,'Unexpected number of recheck events');
  const cases=new Map(dataset.cases.map(c=>[c.id,c]));
  const eventIds=new Set();
  const counts={r03:0,r04:0};
  for(const event of ledger.records){
    assert.ok(event.eventId&&!eventIds.has(event.eventId),'Duplicate/missing event ID');
    eventIds.add(event.eventId);
    assert.ok(allowedCases.has(event.caseId),'Not one of the known disputed cases');
    const c=cases.get(event.caseId);
    assert.ok(c&&c.origin==='public_web_paraphrase','Unexpected prospect origin');
    assert.ok(c.sources.some(s=>s.id===event.originalSourceId&&s.url===event.originalUrl),
      'Original case/source/url does not match immutable dataset');
    assert.ok(Array.isArray(event.originalObservationIds)&&event.originalObservationIds.length>0);
    const allowedObs=new Set(c.observations.filter(o=>o.sourceId===event.originalSourceId).map(o=>o.id));
    for(const id of event.originalObservationIds){
      assert.ok(allowedObs.has(id),'Unknown original observation link: '+id);
    }
    assert.ok(new Set(event.originalObservationIds).size===event.originalObservationIds.length,
      'Duplicate linked observation');
    assert.ok(validDate(event.retrievedOn)&&event.retrievedOn>=ledger.firstSourceObservationDate,
      'Missing/invalid source retrieval date');
    assert.ok(surfaces.has(event.captureSurface),'Wrong evidence capture surface');
    assert.ok(nonEmpty(event.crawlerAgeAtRetrieval),'Must distinguish index age from retrieval date');
    const original=safeURL(event.originalUrl),followup=safeURL(event.evidenceUrl);
    assert.equal(followup.hostname,original.hostname,
      'Evidence from another hostname must not be assigned to this prospect');
    assert.equal(event.httpBodySaved,false,'No raw HTTP response was saved for these indexed/cached records');
    assert.equal(event.rawHtmlSha256,null,'Do not invent an HTML digest from a text excerpt');
    assert.equal(event.historicalObservationProved,false,
      'Later indexed/cached text cannot verify an earlier original snapshot');
    assert.ok(classes.has(event.supportClass),'Unknown evidence comparison type');
    assert.ok(nonEmpty(event.briefParaphrase)&&nonEmpty(event.reviewQuestion)&&nonEmpty(event.caution),
      'Source summary, alternative explanation and limitation are mandatory');
    if(event.supportClass==='different_url_same_business' ||
       event.supportClass==='alternative_context_not_same_page'){
      assert.notEqual(followup.pathname,original.pathname,
        'Different-page evidence must identify a genuinely different URL path');
    }
    if(event.supportClass==='different_cached_version'){
      assert.equal(event.captureSurface,'cached_page_text','Version divergence must come from cached text');
      assert.equal(followup.href,original.href,'Cached comparison must be same URL');
    }
    counts[event.caseId]++;
  }
  assert.equal(counts.r03,2,'Two distinct r03 context checks expected');
  assert.equal(counts.r04,3,'Three distinct r04 cache/path checks expected');
  assert.deepEqual(new Set(ledger.blockingIssues.map(x=>x.caseId)),allowedCases,
    'Both unresolved original snapshots must remain explicit blockers');
  for(const b of ledger.blockingIssues){
    assert.ok(nonEmpty(b.issue)&&nonEmpty(b.next),'Unclear acceptance blocker');
  }
  // Cross-check existing reviewer contracts without changing user-visible labels.
  const blind=makeBlindPack(dataset,rawDataset);
  const status=inspectReview(blind,makeReviewTemplate(blind));
  assert.equal(status.candidateCount,19,'Original blind review length changed');
  assert.equal(status.readyForAdjudication,false,'No reviewer answered 19 blind cases');
  return {
    caseCount:dataset.cases.length,events:ledger.records.length,byCase:counts,
    datasetGitBlobSha:ledger.datasetGitBlobSha,
    recordedSurfaces:[...new Set(ledger.records.map(e=>e.captureSurface))],
    originalHtmlCaptured:false,independentHumanReview:'NOT_RUN',
    accepted:false,nextIteration:'P0-B.4'
  };
}
