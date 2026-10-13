import { hashEvaluationState, validateEvaluationProfile } from './evaluation.mjs';

export const SEO_JEV_TASKS = Object.freeze({
  'search-term-triage': 'examples/evaluation-profiles/search-term-triage.json',
  'landing-page-match': 'examples/evaluation-profiles/landing-page-match.json',
  'seo-cannibalization': 'examples/evaluation-profiles/seo-cannibalization.json',
});
const fail = message => { throw new Error('Jev SEO workflows: '+message); };
const text = (value,max=2000) => String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const good = (value) => typeof value==='string' && Boolean(value.trim());
const sourceId = (prefix,values) => prefix+'-'+hashEvaluationState(values).slice(0,24);
const amount = (value,label) => {
  if(value===undefined || value===null || value==='')return null;
  if(typeof value==='boolean' || !Number.isFinite(Number(value)) || Number(value)<0)
    fail('invalid nonnegative '+label);
  return Number(value);
};
const isPage = value => typeof value==='string' && (value.startsWith('/') || /^https?:\/\/\S+$/i.test(value));
const pageKey=value=>{
  if(!isPage(value))return null;
  try { return new URL(value,'https://local.invalid').pathname.replace(/\/+$/,'').toLowerCase()||'/';}
  catch {return null;}
};
const stateItem = (task,id,state,meta)=>({
  id,state,meta:{...meta,task,sourceKind:'user-provided-snapshot-not-verified-webpage'},
});
const score = row=>amount(row,'metric');
function prepared(task,data,items,skipped,limit,profile) {
  validateEvaluationProfile(profile);
  if(!(task in SEO_JEV_TASKS))fail('unknown task');
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)fail('limit must be 1–1000');
  const ids=new Set();
  for(const item of items){
    if(ids.has(item.id))fail('duplicate source identity, provide unique row ids: '+item.id);
    ids.add(item.id);
  }
  return {
    schemaVersion:1,source:'yaai-jev-seo-prepared',task,
    profileId:profile.id,profileFingerprint:hashEvaluationState({
      questions:profile.questions,reviewThreshold:profile.reviewThreshold,
      reviewQuestions:profile.reviewQuestions||null,
    }),
    inputFingerprint:hashEvaluationState(data),
    generatedAt:new Date().toISOString(),sourceType:'user-supplied-data',
    sourceEvidenceWarning:'Rows are user-provided exports or snapshots; no site was crawled and no API data verified.',
    inputCandidates:items.length+skipped.length,
    chosenCount:Math.min(items.length,limit),
    skippedCount:skipped.length,
    skipped:skipped.slice(0,200),
    limit,items:items.slice(0,limit),
    note:'Only offline candidate preparation. Jev is never called without the separate explicit --execute evaluator.',
  };
}
export function prepareSeoJev({task,data,profile,limit=100}={}) {
  if(!(task in SEO_JEV_TASKS))fail('unsupported task '+task);
  if(!data||typeof data!=='object'||Array.isArray(data))fail('input must be object');
  if(!profile||typeof profile!=='object')fail('missing task-specific evaluation profile');
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)fail('invalid item cap (1–1000)');
  const items=[], skipped=[];
  const skip=(value,why)=>skipped.push({source:text(value,150),reason:why});
  if(task==='search-term-triage'){
    if(!Array.isArray(data.terms))fail('search-term-triage needs terms array');
    for(const [index,row] of data.terms.entries()){
      if(!row||!good(row.query)) {skip('term '+index,'missing-query');continue;}
      const query=text(row.query,500);
      const campaign=text(row.campaign,120);
      const id=good(row.id)?text(row.id,150):sourceId('term',{query,campaign});
      const clicks=amount(row.clicks,'clicks'), conversions=amount(row.conversions,'conversions'),
        revenue=amount(row.revenue,'revenue');
      items.push(stateItem(task,id,{
        businessOffer:text(data.businessOffer,1200)||'Unspecified: do not infer relevance beyond the query.',
        query,campaign,
        reportedMetrics:{clicks,conversions,revenue},
        metricsNote:'Null means missing, not zero; conversions/revenue are external reported values and cannot be inferred by Jev.',
      },{query,campaign,reportedMetrics:{clicks,conversions,revenue}}));
    }
  }
  if(task==='landing-page-match'){
    if(!Array.isArray(data.matches))fail('landing-page-match needs matches array');
    for(const [index,row] of data.matches.entries()){
      if(!row||!good(row.query)||!isPage(row.url)||
         !good(row.pageTitle)||!good(row.pageExcerpt)){
        skip('match '+index,'requires-query-URL-pageTitle-pageExcerpt');continue;
      }
      const query=text(row.query,500),url=text(row.url,1200);
      const id=good(row.id)?text(row.id,150):sourceId('match',{query,url,promise:row.adPromise||''});
      const state={
        query,url,adPromise:text(row.adPromise,600)||null,
        pageTitle:text(row.pageTitle,500),pageExcerpt:text(row.pageExcerpt,2200),
        evidenceCaveat:'Excerpt is a provided snapshot, not a verified complete or live landing page.',
      };
      items.push(stateItem(task,id,state,{query,url,adPromise:state.adPromise}));
    }
  }
  if(task==='seo-cannibalization'){
    if(!Array.isArray(data.overlaps)||!Array.isArray(data.pageSnapshots)){
      fail('seo-cannibalization needs overlaps from webmaster:overlap and pageSnapshots array');
    }
    const snapshots=new Map();
    for(const row of data.pageSnapshots){
      if(!row||!pageKey(row.url)||!good(row.title)||!good(row.summary))continue;
      const key=pageKey(row.url);
      if(snapshots.has(key))fail('duplicate page snapshot path: '+key);
      snapshots.set(key,{url:text(row.url,1200),title:text(row.title,500),summary:text(row.summary,1800)});
    }
    for(const [index,overlap] of data.overlaps.entries()){
      if(!overlap||!good(overlap.query)||!Array.isArray(overlap.pages)||overlap.pages.length<2){
        skip('overlap '+index,'invalid-query-or-page-list');continue;
      }
      const query=text(overlap.query,500);
      const top=overlap.pages.map(page=>({
        ...page,impressions:amount(page.impressions,'impressions'),
        clicks:amount(page.clicks,'clicks'),
      })).sort((a,b)=>(b.impressions??0)-(a.impressions??0)).slice(0,3);
      for(let a=0;a<top.length;a++)for(let b=a+1;b<top.length;b++){
        const pa=top[a],pb=top[b],sa=snapshots.get(pageKey(pa.url)),sb=snapshots.get(pageKey(pb.url));
        if(!sa||!sb){skip(query+' [pair '+(a+1)+'-'+(b+1)+']','missing-page-snapshot');continue;}
        const id=sourceId('overlap',{query,pages:[pageKey(pa.url),pageKey(pb.url)].sort()});
        const state={
          query,firstPage:{...sa,impressions:pa.impressions,clicks:pa.clicks,
            averagePosition:amount(pa.averagePosition,'position')},
          secondPage:{...sb,impressions:pb.impressions,clicks:pb.clicks,
            averagePosition:amount(pb.averagePosition,'position')},
          note:'Webmaster overlap does not establish harmful cannibalization. Page snapshots were provided, not crawled.',
        };
        items.push(stateItem(task,id,state,{query,urlA:sa.url,urlB:sb.url,
          totalImpressions:amount(overlap.totalImpressions,'totalImpressions')}));
      }
    }
  }
  // Fail before any paid call: zero valid observations must not create a batch
  // that can later be misrepresented as successful analysis.
  if(!items.length)fail('no eligible candidates; inspect skipped rows and provide source context');
  return prepared(task,data,items,skipped,limit,profile);
}
function profileSignature(profile) {
  return hashEvaluationState({
    questions:profile.questions,reviewThreshold:profile.reviewThreshold,
    reviewQuestions:profile.reviewQuestions||null,
  });
}
export function routeSeoJev({prepared:batch,evidence,profile}={}) {
  if(batch?.schemaVersion!==1 || batch.source!=='yaai-jev-seo-prepared' ||
     !(batch.task in SEO_JEV_TASKS) || !Array.isArray(batch.items) ||
     !evidence||!Array.isArray(evidence.evaluations) ||
     evidence.source!=='openrouter-decisions')fail('invalid prepared batch or Jev result');
  validateEvaluationProfile(profile);
  if(batch.profileId!==profile.id || batch.profileFingerprint!==profileSignature(profile) ||
     evidence.profile?.id!==profile.id ||
     hashEvaluationState(evidence.profile?.questions)!==hashEvaluationState(profile.questions) ||
     Number(evidence.profile?.reviewThreshold)!==Number(profile.reviewThreshold)) {
    fail('evaluation profile changed: cannot reuse decisions');
  }
  if(evidence.evaluations.length!==batch.items.length)fail('missing or extra evaluation rows');
  const evaluated=new Map();
  for(const row of evidence.evaluations){
    if(!row||evaluated.has(row.itemId))fail('duplicate/invalid Jev evaluation item');
    evaluated.set(row.itemId,row);
  }
  const reviewItems=[];
  for(const item of batch.items){
    const row=evaluated.get(item.id);
    if(!row || row.stateHash!==hashEvaluationState(item.state) ||
       hashEvaluationState(row.meta)!==hashEvaluationState(item.meta)) {
      fail('Jev result does not match source item '+item.id);
    }
    if(!row.route||typeof row.route.needsReview!=='boolean')fail('missing review route '+item.id);
    const keys=Object.keys(profile.questions);
    for(const k of keys){
      const answer=row.answers?.[k],question=profile.questions[k];
      if(!answer||answer.type!==question.type)fail('missing typed question '+k);
      if(question.type==='choice' && !Object.hasOwn(question.criteria,answer.value))fail('unknown choice '+k);
      if(question.type==='noul' && (typeof answer.value!=='number'||answer.value<0||answer.value>1))fail('invalid noul '+k);
      if(question.type==='score' && (typeof answer.value!=='number' || answer.value<0||answer.value>question.criteria.length-1))fail('invalid score '+k);
    }
    const primary=row.answers[keys[0]]?.value||null;
    const strong=batch.task==='search-term-triage' ? primary==='buyer' :
      batch.task==='landing-page-match' ? primary==='strong' : primary==='competing';
    const priority=row.route.needsReview ? 'uncertain_review' :
      strong ? 'priority_review' : 'routine_review';
    reviewItems.push({
      id:item.id,task:batch.task,source:item.meta,
      suggestion:primary,priority,questions:row.answers,
      needsReview:row.route.needsReview,reviewReasons:row.route.lowCertainty||[],
      humanApprovalRequired:true,actionApplied:false,
      note:'Jev suggestion, not a verified conclusion. A human must inspect sources, labels and actual performance before changing pages, ads or budgets.',
    });
  }
  const priorityCounts=Object.fromEntries(['priority_review','uncertain_review','routine_review']
    .map(status=>[status,reviewItems.filter(x=>x.priority===status).length]));
  return {
    schemaVersion:1,source:'yaai-jev-seo-review',task:batch.task,
    inputFingerprint:batch.inputFingerprint,
    profileId:batch.profileId,modelRequested:evidence.modelRequested,
    summary:{items:reviewItems.length,priorityCounts,
      totalCostUsd:evidence.summary?.totalCost??null,
      measuredCostSubtotalUsd:evidence.summary?.measuredCostSubtotal??null,
      missingCostCount:evidence.summary?.missingCostCount??null},
    rows:reviewItems,
    policy:{autopublish:false,autoNegativeKeywords:false,autoMerge:false,
      costOrPerformanceClaims:'External marketing metrics shown only if supplied in source, never inferred from Jev.',
      limits:'Confidence scores uncalibrated on YA AI marketing data. Review priority is not automatic action approval.'},
  };
}
