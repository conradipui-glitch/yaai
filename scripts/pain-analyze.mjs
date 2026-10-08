import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPainEvidenceItems, buildPainMap, painMapMarkdown } from '../lib/pain-discovery.mjs';
import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { resolveOpenRouterApiKey, DEFAULT_JEV_MODEL } from '../lib/jev.mjs';

const args=process.argv.slice(2);
function flag(name) {
  const direct=args.find(x=>x.startsWith(name+'='));
  const idx=args.indexOf(name);
  return direct ? direct.slice(name.length+1) : idx<0 ? null : args[idx+1];
}
if(!args.includes('--execute'))throw new Error('No Jev calls made; add --execute after reviewing input and --limit.');
const topic=flag('--topic'), wordstatPath=flag('--wordstat'), serpPath=flag('--serp');
const out=flag('--out'), rawOut=flag('--evaluation-out'), mdOut=flag('--md');
const limit=Number(flag('--limit')||30);
if(!topic||!out||(!wordstatPath&&!serpPath))throw new Error('Usage: --topic "..." [--wordstat wordstat.json] [--serp serp.json] --out pain-map.json --execute [--limit 30].');
if(!Number.isInteger(limit)||limit<1||limit>150)throw new Error('--limit must be 1–150 Jev decisions.');
if([out,rawOut,mdOut].filter(Boolean).map(x=>path.resolve(x)).some((x,i,arr)=>arr.indexOf(x)!==i))throw new Error('Output paths must be distinct.');
const key=resolveOpenRouterApiKey();
if(!key)throw new Error('Set YAIS_AI or OPENROUTER_API_KEY.');
const [wordstat,serp,profile]=await Promise.all([
  wordstatPath?fs.readFile(path.resolve(wordstatPath),'utf8').then(JSON.parse):Promise.resolve(null),
  serpPath?fs.readFile(path.resolve(serpPath),'utf8').then(JSON.parse):Promise.resolve(null),
  fs.readFile('examples/evaluation-profiles/pain-discovery.json','utf8').then(JSON.parse),
]);
const items=buildPainEvidenceItems({topic,wordstat,serp,limit});
if(!items.length)throw new Error('No candidate source observations; do not label generated queries as audience evidence.');
const evaluations=await evaluateItemsWithJev({
  items:items.map(item=>({id:item.id,state:item.state,meta:item.meta})),
  profile,model:flag('--model')||process.env.YAAI_JEV_MODEL||DEFAULT_JEV_MODEL,
  apiKey:key,
  delayMs:Number(flag('--delay-ms')||0),
  onProgress:({index,total,itemId,route,cost})=>
    console.error('Pain Jev '+index+'/'+total+': '+itemId+' → '+(route.needsReview?'review':'assessed')+' cost='+cost),
});
const map=buildPainMap({topic,evidenceItems:items,evaluations,wordstat,serp});
const destination=path.resolve(out);
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,JSON.stringify(map,null,2)+'\n',{flag:'wx',mode:0o600});
if(mdOut){
  const p=path.resolve(mdOut);
  await fs.mkdir(path.dirname(p),{recursive:true});
  await fs.writeFile(p,painMapMarkdown(map),{flag:'wx',mode:0o600});
}
if(rawOut){
  const p=path.resolve(rawOut);
  await fs.mkdir(path.dirname(p),{recursive:true});
  await fs.writeFile(p,JSON.stringify(evaluations,null,2)+'\n',{flag:'wx',mode:0o600});
}
console.log(JSON.stringify({
  saved:destination,model:evaluations.modelRequested,
  items:map.input.evidenceItemCount,cards:map.summary.painCategories,
  accepted:map.summary.acceptedEvidence,review:map.summary.uncertainEvidence,
  observedCostUsd:map.summary.measuredModelCostUsd,
  note:'Pain cards are categorized hypotheses; supporting links/snippets and observed Wordstat counts are retained.'
},null,2));
