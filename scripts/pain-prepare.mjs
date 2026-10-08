import fs from 'node:fs/promises';
import path from 'node:path';
import { makePainQueryPlan } from '../lib/pain-discovery.mjs';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  const equal = args.find(x=>x.startsWith(name+'='));
  return equal ? equal.slice(name.length+1) : i<0 ? null : args[i+1];
}
const topic=flag('--topic');
const output=flag('--out');
const queryFile=flag('--query-file');
const wordstatFile=flag('--wordstat');
const maxQueries=Number(flag('--limit') || 10);
if(!topic || !output || !queryFile) throw new Error('Usage: --topic "тема" --out plan.json --query-file queries.txt [--wordstat wordstat.json] [--limit 10]');
const wordstat=wordstatFile ? JSON.parse(await fs.readFile(path.resolve(wordstatFile),'utf8')) : null;
const plan=makePainQueryPlan({topic,wordstat,maxQueries});
const outputPath=path.resolve(output), queriesPath=path.resolve(queryFile);
if(outputPath===queriesPath) throw new Error('Output and query file must differ.');
await fs.mkdir(path.dirname(outputPath),{recursive:true});
await fs.mkdir(path.dirname(queriesPath),{recursive:true});
await fs.writeFile(outputPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
await fs.writeFile(queriesPath,plan.queries.map(x=>x.query).join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({
  plan:outputPath,queryFile:queriesPath,queries:plan.queries.length,
  observed:plan.queries.filter(x=>x.kind==='observed-wordstat-phrase').length,
  generated:plan.queries.filter(x=>x.kind==='generated-search-hypothesis').length,
  relevanceChecked:plan.relevanceAudit?.examined ?? 0,
  excludedBeforeSearch:plan.relevanceAudit?.excludedCount ?? 0,
  ambiguousForReview:plan.relevanceAudit?.reviewCount ?? 0,
  note:'Review query-plan.json relevanceAudit and query file before authorizing paid SERP collection.',
},null,2));
