import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {safeConfigId} from './workspace.mjs';

const fail=message=>{throw Error('YA AI metric rules: '+message);};
const VERSION='ad-metrics-weekly-v1';
const MAX_FILE=128*1024;
const sha=data=>createHash('sha256').update(data).digest('hex');
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const RULES=['spend_increase','ctr_drop','conversion_rate_drop'];
const onlyKeys=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))fail('unrecognized or missing metrics fields');
};
const day=value=>{
  if(typeof value!=='string'||!DATE.test(value))fail('dates must be YYYY-MM-DD');
  const n=Date.parse(value+'T00:00:00.000Z');
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)fail('invalid calendar date');
  return n/86400000;
};
const nonnegative=(value,name,integer=false)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||
     (integer&&!Number.isSafeInteger(value))||value>1e12)
    fail('invalid '+name);
};
function period(p){
  onlyKeys(p,['startDate','endDate','complete','impressions','clicks','spendRub','conversions','conversionsFinalized']);
  const start=day(p.startDate),end=day(p.endDate);
  if(end-start!==6)fail('each period must be exactly 7 calendar days');
  if(p.complete!==true)fail('both weekly periods must be marked complete');
  nonnegative(p.impressions,'impressions',true);
  nonnegative(p.clicks,'clicks',true);
  nonnegative(p.spendRub,'spendRub');
  nonnegative(p.conversions,'conversions',true);
  if(p.clicks>p.impressions||p.conversions>p.clicks)
    fail('counts are inconsistent (conversions <= clicks <= impressions)');
  if(typeof p.conversionsFinalized!=='boolean')fail('conversionsFinalized must be a boolean');
  return {start,end};
}
export function validateMetricSnapshot(value,caseId){
  onlyKeys(value,['schemaVersion','caseId','campaignId','currency','source','periods']);
  const id=safeConfigId(caseId,'case id');
  if(value.schemaVersion!==1||value.caseId!==id)fail('metrics do not belong to selected case');
  safeConfigId(value.campaignId,'campaign id');
  if(value.currency!=='RUB'||value.source!=='manual-export')
    fail('only RUB manual-export evidence is supported in this stage');
  onlyKeys(value.periods,['baseline','current']);
  const a=period(value.periods.baseline),b=period(value.periods.current);
  if(b.start!==a.end+1)fail('weeks must be adjacent and equally sized');
  return value;
}
function wilson(success,trials){
  if(!trials)return {low:0,high:1};
  const z=1.96,p=success/trials,z2=z*z,den=1+z2/trials;
  const center=(p+z2/(2*trials))/den;
  const spread=z*Math.sqrt(p*(1-p)/trials+z2/(4*trials*trials))/den;
  return {low:center-spread,high:center+spread};
}
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
function evaluation(input){
  const b=input.periods.baseline,c=input.periods.current;
  const checks=[],findings=[];
  const add=(rule,eligible,triggered,reason,evidence)=>{
    checks.push({rule,eligible,triggered,reason});
    if(triggered)findings.push({
      type:'metric_'+rule,severity:'review',summary:{
        spend_increase:'Review increased spending with stable impressions',
        ctr_drop:'Review statistically separated CTR decline',
        conversion_rate_drop:'Review conversion rate decline after reporting delay',
      }[rule],
      ruleVersion:VERSION,evidence,
      recommendation:'Review data quality, targeting, tracking and attribution. Do not pause campaigns automatically.',
      confidence:'descriptive_signal_not_causal_proof',
      autoActionAllowed:false,
    });
  };
  const spendComparable=b.spendRub>=1000&&b.impressions>=1000&&c.impressions>=1000&&
    c.impressions/b.impressions>=0.9&&c.impressions/b.impressions<=1.1;
  const spendRise=spendComparable&&c.spendRub/b.spendRub>=1.5;
  add('spend_increase',spendComparable,spendRise,
    !spendComparable?'Insufficient baseline spend or impressions differ by >10%':
      spendRise?'Spend rose >=50% while impressions remained within +/-10%':'No threshold breach',
    {baselineSpendRub:b.spendRub,currentSpendRub:c.spendRub,
      baselineImpressions:b.impressions,currentImpressions:c.impressions,
      changeRatio:b.spendRub?round(c.spendRub/b.spendRub):null});
  const ctrBase=b.impressions?b.clicks/b.impressions:0;
  const ctrNow=c.impressions?c.clicks/c.impressions:0;
  const ctrEligible=b.impressions>=1000&&c.impressions>=1000&&b.clicks>=30;
  const c1=wilson(b.clicks,b.impressions),c2=wilson(c.clicks,c.impressions);
  const ctrDrop=ctrEligible&&ctrNow<=ctrBase*0.7&&c2.high<c1.low;
  add('ctr_drop',ctrEligible,ctrDrop,
    !ctrEligible?'Need >=1000 impressions per week and >=30 baseline clicks':
      ctrDrop?'CTR fell >=30% with separated 95% Wilson intervals':'No conservative CTR signal',
    {baselineCTR:round(ctrBase),currentCTR:round(ctrNow),
      baselineClicks:b.clicks,currentClicks:c.clicks,
      baselineImpressions:b.impressions,currentImpressions:c.impressions,
      baselineWilson:{low:round(c1.low),high:round(c1.high)},
      currentWilson:{low:round(c2.low),high:round(c2.high)}});
  const conversionEligible=b.conversionsFinalized&&c.conversionsFinalized&&
    b.clicks>=150&&c.clicks>=150&&b.conversions>=20;
  const cvrBase=b.clicks?b.conversions/b.clicks:0;
  const cvrNow=c.clicks?c.conversions/c.clicks:0;
  const v1=wilson(b.conversions,b.clicks),v2=wilson(c.conversions,c.clicks);
  const convDrop=conversionEligible&&cvrNow<=cvrBase*0.6&&v2.high<v1.low;
  add('conversion_rate_drop',conversionEligible,convDrop,
    !conversionEligible?'Conversion data not finalized or sample too small (150 clicks per week, 20 baseline conversions)':
      convDrop?'Conversion rate fell >=40% with separated 95% Wilson intervals':
      'No conservative conversion rate signal',
    {baselineConversions:b.conversions,currentConversions:c.conversions,
      baselineClicks:b.clicks,currentClicks:c.clicks,
      baselineCVR:round(cvrBase),currentCVR:round(cvrNow),
      baselineWilson:{low:round(v1.low),high:round(v1.high)},
      currentWilson:{low:round(v2.low),high:round(v2.high)},
      finalized:true});
  return {checks,findings};
}
export function evaluateMetricSnapshot(input,caseId){
  const validated=validateMetricSnapshot(input,caseId);
  const computed=evaluation(validated);
  return {rulesVersion:VERSION,caseId:validated.caseId,
    campaignId:validated.campaignId,
    evidence:{source:'manual-export',currency:'RUB',
      baseline:validated.periods.baseline,current:validated.periods.current},
    ...computed,
    limitations:[
      'These are manually supplied aggregate metrics, not authenticated provider data.',
      'Wilson interval separation is a conservative descriptive heuristic, not proof of causation.',
      'Weekly changes may reflect seasonality, audience shifts, reporting delays or tracking changes.',
      'No fraud determination and no automatic advertising changes.',
    ]};
}
function rootOf(v){if(typeof v!=='string'||!v.trim())fail('explicit workspace required');return path.resolve(v);}
async function safeDir(dir,create=false){
  const absolute=path.resolve(dir),root=path.parse(absolute).root;
  let cur=root;
  for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){
    cur=path.join(cur,part);
    let st;
    try{st=await fs.lstat(cur);}
    catch(e){
      if(e.code!=='ENOENT')throw e;
      if(!create)return false;
      try{await fs.mkdir(cur,{mode:0o700});}
      catch(err){if(err.code!=='EEXIST')throw err;}
      st=await fs.lstat(cur);
    }
    if(!st.isDirectory()||st.isSymbolicLink())fail('unsafe directory');
  }
  return true;
}
async function readJson(file){
  const st=await fs.lstat(file);
  if(st.isSymbolicLink()||!st.isFile()||st.size<2||st.size>MAX_FILE)fail('unsafe or oversized JSON');
  const bytes=await fs.readFile(file);
  if(bytes.length>MAX_FILE)fail('JSON exceeds 128 KiB');
  let parsed;
  try{parsed=JSON.parse(bytes.toString('utf8'));}
  catch{fail('invalid metrics JSON');}
  return {parsed,bytes};
}
async function caseFile(root,id){
  if(!await safeDir(root)||!await safeDir(path.join(root,'cases')))fail('case workspace missing');
  const {parsed}=await readJson(path.join(root,'cases',id+'.json'));
  if(parsed?.id!==id)fail('case mismatch');
}
const storeDir=(root,id)=>path.join(root,'tasks','metric-checks',id);
const stableRecord=(input,caseId,sourceSha)=>({
  schemaVersion:1,caseId,campaignId:input.campaignId,
  sourceRelativePath:'inputs/'+caseId+'/ad-metrics.json',
  sourceSha256:sourceSha,inputSha256:sha(JSON.stringify(input)),
  input,analysis:evaluateMetricSnapshot(input,caseId),
});
const recordHash=rec=>sha(JSON.stringify(rec));
const fileName=rec=>'check-'+recordHash(rec)+'.json';
function validateRecord(record,caseId,filename){
  if(record?.schemaVersion!==1||record.caseId!==caseId||
     record.sourceRelativePath!=='inputs/'+caseId+'/ad-metrics.json'||
     !/^[a-f0-9]{64}$/.test(record.sourceSha256)||
     !/^[a-f0-9]{64}$/.test(record.inputSha256)||
     fileName(record)!==filename)fail('metric check integrity mismatch');
  validateMetricSnapshot(record.input,caseId);
  if(recordHash(record.input)!==record.inputSha256)
    fail('metric source fingerprint mismatch');
  if(JSON.stringify(record.analysis)!==JSON.stringify(evaluateMetricSnapshot(record.input,caseId)))
    fail('metric findings differ from deterministic policy');
  return record;
}
async function readSaved(root,id){
  const dir=storeDir(root,id);
  if(!await safeDir(dir))return [];
  const records=[];
  for(const name of (await fs.readdir(dir)).sort()){
    if(!/^check-[a-f0-9]{64}\.json$/.test(name))fail('unrecognized metric check file');
    const {parsed}=await readJson(path.join(dir,name));
    records.push({checkId:name.slice(6,-5),...validateRecord(parsed,id,name)});
    if(records.length>100)fail('more than 100 saved metric checks; compact/archive explicitly first');
  }
  return records;
}
export async function listSavedMetricSignals({workspaceRoot,caseId}={}){
  const root=rootOf(workspaceRoot),id=safeConfigId(caseId,'case id');
  await caseFile(root,id);
  const checks=await readSaved(root,id);
  return checks.flatMap(rec=>rec.analysis.findings.map(f=>{
    const signalId='signal-'+sha(['metric-v1',id,rec.checkId,f.type].join('\0')).slice(0,40);
    return {
      id:signalId,caseId:id,taskId:null,type:f.type,severity:f.severity,
      summary:f.summary,occurredAt:rec.input.periods.current.endDate+'T23:59:59.000Z',
      attempt:null,errorCode:null,campaignId:rec.campaignId,
      checkId:rec.checkId,evidence:f.evidence,ruleVersion:f.ruleVersion,
      recommendation:f.recommendation,confidence:f.confidence,
      autoActionAllowed:false,
    };
  }));
}
export async function runMetricCheck({workspaceRoot,caseId,save=false}={}){
  const root=rootOf(workspaceRoot),id=safeConfigId(caseId,'case id');
  if(typeof save!=='boolean')fail('save must be boolean');
  await caseFile(root,id);
  const dir=path.join(root,'inputs',id);
  if(!await safeDir(dir))fail('input folder missing');
  const {bytes,parsed}=await readJson(path.join(dir,'ad-metrics.json'));
  const record=stableRecord(parsed,id,sha(bytes));
  // Byte hash tracks the imported file; normalized JSON hash checks the
  // stored evidence snapshot even if the original import later changes.
  const rawRecord=record;
  const name=fileName(rawRecord);
  const checkId=name.slice(6,-5);
  const preview={
    caseId:id,campaignId:parsed.campaignId,checkId,
    sourceRelativePath:rawRecord.sourceRelativePath,
    sourceFileSha256:sha(bytes),rulesVersion:VERSION,
    ...rawRecord.analysis,
    saved:false,networkCalled:false,paidRequests:0,
    autoActionAllowed:false,
  };
  if(!save)return preview;
  const outDir=storeDir(root,id);
  await safeDir(outDir,true);
  const file=path.join(outDir,name);
  let created=false;
  try{await fs.writeFile(file,JSON.stringify(rawRecord,null,2)+'\n',{flag:'wx',mode:0o600});created=true;}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const {parsed:stored}=await readJson(file);
  validateRecord(stored,id,name);
  return {...preview,saved:true,alreadySaved:!created};
}
