// P0-B.3: deterministic methodology + compatibility smoke test.
// It does NOT discover companies, run models, collect external data, or send offers.
// P0-B.4/5 will supply independently human-labelled fixtures and compare methods.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { safeConfigId } from '../lib/workspace.mjs';
import { buildPainReportDocument } from '../lib/evidence-report.mjs';

const prefix = new URL('../playbooks/operator-local-smb-diagnostic-v0/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json',prefix),'utf8'));
const fixture = JSON.parse(await fs.readFile(new URL('fixtures/smoke-cases.json',prefix),'utf8'));

const ensure = (ok,msg) => assert.ok(ok,msg);
function validateUrl(source) {
  if (source.url === null && source.kind === 'wordstat_phrase') return;
  ensure(typeof source.url === 'string', 'Missing source URL: '+source.id);
  const u = new URL(source.url);
  ensure(['https:','http:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password,
    'Unsafe source URL: '+source.id);
}
function validateCase(scenario) {
  safeConfigId(scenario.caseId,'caseId');
  ensure(scenario.synthetic === true, 'Fixture must be explicitly synthetic');
  ensure(['local_service','local_retail','local_manufacturer'].includes(scenario.prospect.businessType),
    'Business outside manifest');
  ensure(scenario.region && scenario.niche && scenario.prospect.id, 'Missing project context');
  const src = new Map();
  for (const item of scenario.sources) {
    ensure(item?.id && !src.has(item.id),'Duplicate/missing source ID');
    ensure(['synthetic_test_only'].includes(item.rightsStatus),'Disallowed material in CI fixtures');
    ensure(item.region===scenario.region, 'Source region mismatch');
    ensure(Number.isFinite(Date.parse(item.observedAt)),'Missing source date');
    validateUrl(item);
    src.set(item.id,item);
  }
  const observations = new Map();
  for (const item of scenario.observations) {
    ensure(item?.id && !observations.has(item.id),'Duplicate/missing observation ID');
    ensure(src.has(item.sourceId),'Unbound observation '+item.id);
    ensure(item.evidenceType==='observed','An inference must not masquerade as direct observation');
    ensure(typeof item.statement==='string' && item.statement.length > 10,'No text context');
    ensure(Number.isFinite(Date.parse(item.observedAt)),'Missing observation timestamp');
    ensure(item.observedAt===src.get(item.sourceId).observedAt,'Observation/source time inconsistent');
    ensure(item.kind === src.get(item.sourceId).kind ||
      (item.kind === 'site_content' && src.get(item.sourceId).kind === 'public_site'),
      'Observation kind/source kind mismatch');
    ensure(item.confidenceLimit,'Missing evidence limitation');
    if (item.kind==='wordstat_phrase') ensure(item.observedCount==null || Number.isFinite(item.observedCount),
      'Wordstat count must be number or null');
    observations.set(item.id,item);
  }
  for (const id of scenario.expected.evidenceIds) ensure(observations.has(id),'Proposed evidence ID not found: '+id);
  ensure(scenario.expected.sendAllowed===false,'Automatic outreach is forbidden');
  ensure(scenario.expected.limits.length>0,'Missing limits/unknowns');
  return observations;
}

// A minimal *spot-check decision trace*, not the upcoming business inference engine.
function manualRuleTrace(scenario) {
  const obs = validateCase(scenario);
  const prospectId=scenario.prospect.id;
  const rows=[...obs.values()].filter(row=>row.targetBusinessId===prospectId);
  const missingInSerp=rows.find(row=>row.signal==='site_not_observed_in_serp');
  const officialSite=rows.find(row=>row.signal==='official_site_observed');
  if (missingInSerp && officialSite) return {
    status:'hold_for_review',evidenceIds:[missingInSerp.id,officialSite.id],reason:'contradictory_public_presence'
  };
  const cta=rows.find(row=>row.signal==='contact_cta_present'&&row.kind==='site_content');
  const broken=rows.find(row=>row.signal==='broken_contact_cta'&&row.kind==='site_http'&&row.httpStatus===404);
  if (cta && broken) return {
    status:'propose_draft',evidenceIds:[cta.id,broken.id],reason:'observed_broken_conversion_path'
  };
  return {status:'insufficient_evidence',evidenceIds:[],reason:'no_reproducible_prospect_specific_issue'};
}

ensure(manifest.schemaVersion===1 && manifest.source==='yaai-playbook-manifest','Manifest contract');
ensure(manifest.id==='operator-local-smb-diagnostic' && manifest.version==='0.1.0','Playbook ID / version');
ensure(manifest.iteration==='P0-B.3'&&manifest.lifecycle==='methodology_only','Wrong iteration/lifecycle');
ensure(manifest.access.forbidden.includes('send_outreach'),'Outreach permission absent');
ensure(manifest.access.forbidden.includes('read_other_case'),'Project isolation missing');
ensure(manifest.compatibility.evidenceReportV1.includes("reportType='pain-discovery'"),
  'Evidence Report compatibility boundary missing');
ensure(manifest.steps.length===8&&new Set(manifest.steps.map(s=>s.id)).size===8,'Steps not well formed');
ensure(manifest.steps.every(s=>s.input.length && s.output.length && s.qualityGate),'Unspecified step');
ensure(fixture.schemaVersion===1&&fixture.source==='yaai-playbook-test-fixtures',
  'Invalid fixture schema');
ensure(fixture.playbookId===manifest.id && fixture.playbookVersion===manifest.version,
  'Fixture/manifest version drift');
ensure(fixture.scenarios.length===3,'Missing three P0-B.3 smoke scenarios');
const ids = new Set();
const audit=[];
for(const sc of fixture.scenarios){
  ensure(!ids.has(sc.id),'Duplicate scenario ID');
  ids.add(sc.id);
  const actual=manualRuleTrace(sc);
  assert.equal(actual.status,sc.expected.status,sc.id+': decision mismatch');
  assert.deepEqual(actual.evidenceIds,sc.expected.evidenceIds,sc.id+': source trace mismatch');
  ensure(sc.expected.proposition===null || actual.status==='propose_draft',
    'Unsupported offer should not exist');
  ensure(!/lost sales|потерянн(ая|ые|ых).*выручк|потеря прибыли/i.test(sc.expected.proposition||''),
    'Unverified revenue claim in offer');
  const rerun=manualRuleTrace(structuredClone(sc));
  assert.deepEqual(actual,rerun,sc.id+': inconsistent repeat evaluation');
  audit.push({id:sc.id,status:actual.status,evidenceIds:actual.evidenceIds,reason:actual.reason});
}
ensure(ids.has('actionable')&&ids.has('contested')&&ids.has('insufficient'),
  'Required positive/contradiction/insufficient coverage absent');
// Negative cases must fail CLOSED, not silently generate plausible offers.
const base=fixture.scenarios[0];
const badId=structuredClone(base);
badId.caseId='../other-project';
assert.throws(()=>manualRuleTrace(badId),/id|safe|invalid|case/i);
const badSource=structuredClone(base);
badSource.observations[1].sourceId='src-not-found';
assert.throws(()=>manualRuleTrace(badSource),/Unbound observation/);
const badLink=structuredClone(base);
badLink.sources[0].url='javascript:alert(1)';
assert.throws(()=>manualRuleTrace(badLink),/Unsafe source URL/);
const badDate=structuredClone(base);
badDate.observations[0].observedAt='2024-01-01T00:00:00Z';
assert.throws(()=>manualRuleTrace(badDate),/time inconsistent/);
const badSemantics=structuredClone(fixture.scenarios[2]);
badSemantics.observations[0].evidenceType='verified_buyer_complaint';
assert.throws(()=>manualRuleTrace(badSemantics),/masquerade/);
const crossCase=structuredClone(base);
crossCase.observations.push({...crossCase.observations[0],id:'obs-other',sourceId:'src-from-other-case'});
assert.throws(()=>manualRuleTrace(crossCase),/Unbound observation/);
// Evidence Report v1 is *only* pain-discovery; never serialize a prospect audit into it.
assert.throws(()=>buildPainReportDocument({
  schemaVersion:1,source:manifest.source,prospectAudit:base
}),/pain-discovery|schema|source|map/i);
const oldEvidence=await fs.readFile(new URL('../lib/evidence-report.mjs',import.meta.url),'utf8');
ensure(oldEvidence.includes("source: 'yaai-evidence-report'"),'Existing evidence report version missing');
console.log('P0-B.3 methodology smoke + cross-contract: PASS');
console.log(JSON.stringify({playbook:manifest.id,version:manifest.version,scenarios:audit,negativeCases:6,paidCalls:0,externalWrites:0},null,2));
