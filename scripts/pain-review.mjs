import fs from 'node:fs/promises';
import path from 'node:path';
import { preparePainReview } from '../lib/pain-quality.mjs';

const args=process.argv.slice(2);
function flag(name) {
  const match=args.find(s=>s.startsWith(name+'='));
  const idx=args.indexOf(name);
  return match ? match.slice(name.length+1) : idx<0 ? null : args[idx+1];
}
const input=flag('--map'), output=flag('--out'), sampleSize=Number(flag('--sample-size')||100);
if(!input || !output)throw new Error('Usage: npm run pain:review -- --map /private/pain-map.json --out /private/pain-review.json [--sample-size 100].');
const map=JSON.parse(await fs.readFile(path.resolve(input),'utf8'));
const queue=preparePainReview(map,{sampleSize});
const destination=path.resolve(output);
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,JSON.stringify(queue,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({
  saved:destination,topic:queue.topic,population:queue.sampling.populationCount,
  sampled:queue.sampling.sampledCount,sampling:queue.sampling.strategy,
  note:'No labels were invented. Open the saved file and fill each label after reviewing source evidence.'
},null,2));
