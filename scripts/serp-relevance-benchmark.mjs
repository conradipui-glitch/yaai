import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectPainSerpCandidates, SERP_RELEVANCE_RULESET } from '../lib/pain-serp-relevance.mjs';

const HEADERS = [
  'id','decision','query','title','excerpt','url','reason',
  'gold_relevance','gold_useful_signal','reviewer_note',
];
const BLIND_HEADERS=['id','query','title','excerpt','url','gold_relevance','gold_useful_signal','reviewer_note'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const requireTrue = (condition, message) => {
  if (!condition) throw Error('SERP benchmark: ' + message);
};
const identity = entry => hash(JSON.stringify([
  entry.query,entry.url,entry.excerpt,
])).slice(0,24);
function csvCell(raw) {
  let value=String(raw ?? '');
  // Prevent formula injection if a reviewer opens the CSV in Excel/Calc.
  if (/^\s*[=+@-]/u.test(value)) value="'"+value;
  return '"'+value.replace(/"/g,'""')+'"';
}
export function csvString(rows) {
  return '\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export function parseCsv(text) {
  const source=String(text).replace(/^\ufeff/u,'');
  const rows=[]; let current=[], field='', quotes=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quotes) {
      if(c==='"'&&source[i+1]==='"'){field+='"';i++;}
      else if(c==='"') quotes=false;
      else field+=c;
    } else if(c==='"') {
      requireTrue(field==='', 'invalid quote placement in CSV');
      quotes=true;
    } else if(c===';') {current.push(field);field='';}
    else if(c==='\r'&&source[i+1]==='\n'){
      current.push(field);rows.push(current);current=[];field='';i++;
    } else if(c==='\n'){current.push(field);rows.push(current);current=[];field='';}
    else field+=c;
  }
  requireTrue(!quotes,'unclosed CSV quote');
  if(field||current.length){current.push(field);rows.push(current);}
  return rows;
}
function diversify(pool, seed) {
  const perQuery=new Map();
  for(const item of pool){
    const key=item.query.toLocaleLowerCase('ru-RU');
    if(!perQuery.has(key))perQuery.set(key,[]);
    perQuery.get(key).push(item);
  }
  const groups=[...perQuery.entries()].sort((a,b)=>hash(seed+a[0]).localeCompare(hash(seed+b[0])));
  for(const [,group] of groups)group.sort((a,b)=>hash(seed+a.id).localeCompare(hash(seed+b.id)));
  const sorted=[];
  while(groups.some(([,g])=>g.length))for(const [,g] of groups)if(g.length)sorted.push(g.shift());
  return sorted;
}
export function buildReviewPack({topic,serp,size=48,seed='benchmark-v1'}={}) {
  requireTrue(typeof topic==='string'&&topic.trim(),'missing topic');
  requireTrue(Number.isInteger(size)&&size>=6&&size<=500,'size must be 6–500');
  const selection=inspectPainSerpCandidates({topic,serp});
  requireTrue(selection.audit?.examined>0,'no valid SERP items');
  const excluded=selection.audit.excluded.map(item=>({
    ...item,decision:'exclude',id:identity(item),
  }));
  const retained=selection.retained.map(item=>({
    ...item,excerpt:item.passage||item.title,
    decision:item.relevanceDecision,reason:item.relevanceReason,
    id:identity({...item,excerpt:item.passage||item.title}),
  }));
  const sourceRows=[...excluded,...retained];
  requireTrue(new Set(sourceRows.map(row=>row.id)).size===sourceRows.length,
    'duplicate source identities in SERP review');
  const order=['exclude','review','keep'];
  const pools=Object.fromEntries(order.map(x=>[
    x,diversify(sourceRows.filter(item=>item.decision===x),seed),
  ]));
  const requested=Math.min(size,sourceRows.length);
  const targets=Object.fromEntries(order.map((x,i)=>[
    x,Math.floor(requested/3)+(i<requested%3?1:0),
  ]));
  const picked=[],pickedIds=new Set();
  for(const status of order)for(let j=0;j<targets[status]&&pools[status].length;j++){
    const item=pools[status].shift();
    picked.push(item);pickedIds.add(item.id);
  }
  // Reallocate quotas when one stratum has fewer candidates.
  while(picked.length<requested){
    let progress=false;
    for(const status of order){
      if(pools[status].length&&picked.length<requested){
        const item=pools[status].shift();
        if(pickedIds.has(item.id))continue;
        picked.push(item);pickedIds.add(item.id);progress=true;
      }
    }
    if(!progress)break;
  }
  const rows=picked.sort((a,b)=>hash('review-order:'+seed+a.id).localeCompare(hash('review-order:'+seed+b.id)))
    .map(item=>({
      id:item.id,decision:item.decision,query:item.query,title:item.title,
      excerpt:item.excerpt,url:item.url,reason:item.reason,
      gold_relevance:'',gold_useful_signal:'',reviewer_note:'',
    }));
  const counts=Object.fromEntries(order.map(status=>[
    status,{population:sourceRows.filter(x=>x.decision===status).length,
      sampled:rows.filter(x=>x.decision===status).length},
  ]));
  return {
    manifest:{
      schemaVersion:1,source:'yaai-serp-human-review-pack',topic,
      ruleset:SERP_RELEVANCE_RULESET,seed,
      population:sourceRows.length,sampleCount:rows.length,counts,
      rows:rows.map(({id,decision,query,title,excerpt,url,reason})=>({
        id,decision,query,title,excerpt,url,reason,
      })),
      instructions:'A human must fill gold_relevance (relevant|irrelevant|unclear) and gold_useful_signal (yes|no|unclear); predictions are not ground truth. Sampling is stratified and query-diversified, not an unbiased population estimate.',
    },
    rows,
    csv:csvString([HEADERS,...rows.map(row=>HEADERS.map(field=>row[field]))]),
    blindCsv:csvString([BLIND_HEADERS,...rows.map(row=>BLIND_HEADERS.map(field=>row[field]))]),
  };
}

export function scoreReviewPack({manifest,csv}={}) {
  requireTrue(manifest?.schemaVersion===1&&manifest.source==='yaai-serp-human-review-pack' &&
    Array.isArray(manifest.rows),'invalid review manifest');
  requireTrue(manifest.rows.length===manifest.sampleCount, 'manifest count mismatch');
  const records=parseCsv(csv);
  const headers=records.shift();
  const full=JSON.stringify(headers)===JSON.stringify(HEADERS);
  const blind=JSON.stringify(headers)===JSON.stringify(BLIND_HEADERS);
  requireTrue(full||blind,'CSV columns differ from expected full or blind template');
  requireTrue(records.length===manifest.rows.length,'review has missing/extra rows');
  const originals=new Map(manifest.rows.map(r=>[r.id,r]));
  requireTrue(originals.size===manifest.rows.length,'duplicate IDs in manifest');
  const seen=new Set(), labeled=[];
  for(const record of records){
    requireTrue(record.length===headers.length,'invalid row width');
    const item=Object.fromEntries(headers.map((h,i)=>[h,record[i]]));
    const original=originals.get(item.id);
    requireTrue(original&&!seen.has(item.id),'duplicate or unknown review ID');
    seen.add(item.id);
    for(const name of (full?['decision','query','title','excerpt','url','reason']:
      ['query','title','excerpt','url'])){
      requireTrue(item[name]===original[name] || item[name]==="'"+original[name],
        'immutable source field changed: '+item.id+' '+name);
    }
    // In blind review, machine decision and reason are restored only from
    // the original manifest, never from reviewer-controlled columns.
    item.decision=original.decision;
    item.reason=original.reason;
    const relevance=item.gold_relevance.trim().toLocaleLowerCase('en-US');
    const useful=item.gold_useful_signal.trim().toLocaleLowerCase('en-US');
    requireTrue(['','relevant','irrelevant','unclear'].includes(relevance),
      'invalid relevance label on '+item.id);
    requireTrue(['','yes','no','unclear'].includes(useful),
      'invalid useful-signal label on '+item.id);
    requireTrue(useful!=='yes'||relevance==='relevant',
      'useful-signal=yes requires relevant for the study topic');
    labeled.push({...item,gold_relevance:relevance,gold_useful_signal:useful});
  }
  const groups={};
  let usefulPreserved=0,usefulExcluded=0;
  for(const status of ['exclude','review','keep']){
    const rows=labeled.filter(x=>x.decision===status);
    const decisive=rows.filter(x=>['relevant','irrelevant'].includes(x.gold_relevance));
    const relevant=decisive.filter(x=>x.gold_relevance==='relevant').length;
    const irrelevant=decisive.length-relevant;
    groups[status]={
      sampled:rows.length,decisiveLabels:decisive.length,
      unclear:rows.filter(x=>x.gold_relevance==='unclear').length,
      unreviewed:rows.filter(x=>!x.gold_relevance).length,
      relevant,irrelevant,
      // Rates describe only labeled reviewed rows within that stratum,
      // never inferred prevalence across all SERP data.
      correctExclusionRateAmongLabeled: status==='exclude' && decisive.length>=5
        ? irrelevant/decisive.length:null,
      harmfulExclusionRateAmongLabeled: status==='exclude'&&decisive.length>=5
        ? relevant/decisive.length:null,
    };
    for(const row of rows)if(row.gold_useful_signal==='yes'){
      if(status==='exclude')usefulExcluded++; else usefulPreserved++;
    }
  }
  const fullyReviewed=labeled.every(row=>['relevant','irrelevant'].includes(row.gold_relevance)
    && ['yes','no','unclear'].includes(row.gold_useful_signal));
  const decisiveTotal=Object.values(groups).reduce((n,x)=>n+x.decisiveLabels,0);
  return {
    schemaVersion:1,source:'yaai-serp-human-review-results',topic:manifest.topic,
    sampleCount:labeled.length,decisiveTotal,
    status:fullyReviewed?'descriptive_sample_complete':'awaiting_independent_labels',
    groups,
    usefulSignals:{excluded:usefulExcluded,preserved:usefulPreserved,
      note:'Count only human-labeled useful sources in this review sample. Do not extrapolate to entire search corpus.'},
    limitations:[
      'Independent humans must supply the gold labels. Jev outcomes are not ground truth.',
      'Stratified and query-diversified selection deliberately overrepresents rare error cases. Sample rates are descriptive, not estimates of the whole population.',
      'Source is a saved SERP excerpt, not the verified full page. Unclear labels stay outside decisive denominators.',
      'Insufficient (<5) decisive exclusion labels suppress exclusion-rate percentages.',
    ],
  };
}
async function ensureFree(files) {
  for(const file of files)try {
    await fs.lstat(file);
    throw Error('Refusing to overwrite existing benchmark: '+file);
  }catch(err){if(err.code!=='ENOENT')throw err;}
}
const currentFile=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===currentFile) {
  const [action,...args]=process.argv.slice(2);
  const flag=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  try {
    if(action==='prepare'){
      const source=flag('--serp'),topic=flag('--topic'),out=flag('--out');
      requireTrue(source&&topic&&out,'prepare requires --serp --topic --out');
      const manifestFile=path.resolve(out+'.manifest.json'),
        csvFile=path.resolve(out+'.csv'),blindFile=path.resolve(out+'.blind.csv');
      await ensureFree([manifestFile,csvFile,blindFile]);
      const pack=buildReviewPack({
        serp:JSON.parse(await fs.readFile(source,'utf8')),topic,
        size:Number(flag('--size')||48),seed:flag('--seed')||'benchmark-v1',
      });
      await fs.mkdir(path.dirname(csvFile),{recursive:true,mode:0o700});
      await fs.writeFile(manifestFile,JSON.stringify(pack.manifest,null,2)+'\n',{flag:'wx',mode:0o600});
      await fs.writeFile(csvFile,pack.csv,{flag:'wx',mode:0o600});
      await fs.writeFile(blindFile,pack.blindCsv,{flag:'wx',mode:0o600});
      console.log(JSON.stringify({manifest:manifestFile,csv:csvFile,blindCsv:blindFile,counts:pack.manifest.counts,
        independentHumanLabels:0,paidApiCalls:0},null,2));
    } else if(action==='score'){
      const manifestFile=flag('--manifest'),csvFile=flag('--labels'),out=flag('--out');
      requireTrue(manifestFile&&csvFile&&out,'score requires --manifest --labels --out');
      const filename=path.resolve(out);await ensureFree([filename]);
      const score=scoreReviewPack({
        manifest:JSON.parse(await fs.readFile(manifestFile,'utf8')),
        csv:await fs.readFile(csvFile,'utf8'),
      });
      await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
      await fs.writeFile(filename,JSON.stringify(score,null,2)+'\n',{flag:'wx',mode:0o600});
      console.log(JSON.stringify({result:filename,status:score.status,
        reviewed:score.decisiveTotal,paidApiCalls:0},null,2));
    } else {
      throw Error('Usage: node scripts/serp-relevance-benchmark.mjs prepare --serp FILE --topic TOPIC --out PREFIX [--size 48] | score --manifest FILE --labels FILE --out FILE');
    }
  }catch(err){console.error(err.message);process.exitCode=1;}
}
