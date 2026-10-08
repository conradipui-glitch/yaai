import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluatePainQuality, painQualityMarkdown } from '../lib/pain-quality.mjs';

const args=process.argv.slice(2);
function flag(name) {
  const match=args.find(s=>s.startsWith(name+'='));
  const idx=args.indexOf(name);
  return match ? match.slice(name.length+1) : idx<0 ? null : args[idx+1];
}
const input=flag('--map'), labels=flag('--review'), output=flag('--out'), markdown=flag('--md');
const targetLabels=Number(flag('--target-labels')||50);
if(!input||!labels||!output)throw new Error('Usage: npm run pain:quality -- --map /private/pain-map.json --review /private/pain-review.json --out /private/pain-quality.json [--md /private/quality.md].');
const files=[input,labels,output,markdown].filter(Boolean).map(s=>path.resolve(s));
if(new Set(files).size!==files.length)throw new Error('Input, review and output paths must be distinct.');
const [map,review]=await Promise.all([
  fs.readFile(path.resolve(input),'utf8').then(JSON.parse),
  fs.readFile(path.resolve(labels),'utf8').then(JSON.parse),
]);
const result=evaluatePainQuality(map,review,{targetLabels});
const destination=path.resolve(output);
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
if(markdown){
  const p=path.resolve(markdown);
  await fs.mkdir(path.dirname(p),{recursive:true});
  await fs.writeFile(p,painQualityMarkdown(result),{flag:'wx',mode:0o600});
}
console.log(JSON.stringify({
  saved:destination,status:result.status,labeled:result.sample.labeled,targetLabels,
  precision:result.metrics.painPrecision,recall:result.metrics.painRecall,
  validatedEvidenceCoverage:result.metrics.validatedEvidenceCoverage,
  costPerValidatedPainUsd:result.metrics.costPerValidatedTruePositiveUsd,
},null,2));
