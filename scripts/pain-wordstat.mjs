import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverYandexFolderId } from '../lib/yandex-folder.mjs';
import { collectYandexWithCheckpoints } from '../lib/yandex-checkpoints.mjs';

const args=process.argv.slice(2);
function flag(name) {
  const direct=args.find(x=>x.startsWith(name+'='));
  const idx=args.indexOf(name);
  return direct ? direct.slice(name.length+1) : idx<0 ? null : args[idx+1];
}
if(!args.includes('--execute'))throw new Error('No Yandex Wordstat API calls made. Add --execute.');
const output=flag('--out'), region=flag('--region');
const seeds=String(flag('--seeds')||'').split(',').map(x=>x.trim()).filter(Boolean);
const numPhrases=Number(flag('--num-phrases')||100);
if(!output || !region || !/^\d+$/.test(region))throw new Error('Required: --seeds "query1,query2" --region numeric-region-id --out wordstat.json --execute.');
if(!seeds.length || seeds.length>3 || seeds.some(x=>x.length>160))throw new Error('1–3 nonempty seeds (max 160 characters each) required; each seed costs one Wordstat request.');
if(!Number.isInteger(numPhrases) || numPhrases<1 || numPhrases>200)throw new Error('--num-phrases must be 1–200.');
const key=String(process.env.YAIS_API||process.env.YANDEX_API_KEY||'').trim();
if(!key)throw new Error('Yandex Wordstat key missing (YAIS_API or YANDEX_API_KEY).');
const folder=await discoverYandexFolderId({
  apiKey:key,
  keyId:String(process.env.YAIS_ID||'').trim(),
  folderId:String(process.env.YAIS_FOLDER_ID||process.env.YANDEX_FOLDER_ID||'').trim(),
});
if(!folder)throw new Error('Yandex folder ID unavailable.');
const requests=seeds.map(seed=>({seed,region,numPhrases,folder}));
const checkpointed=await collectYandexWithCheckpoints({
  kind:'wordstat-toprequests-v1',output,
  directory:flag('--checkpoint-dir'),
  requests,
  validateResult(result,request) {
    if(result?.seed!==request.seed || !Array.isArray(result?.top) ||
       !Array.isArray(result?.associated)) throw new Error('Invalid saved Wordstat response for '+request.seed);
  },
  async fetchRequest({seed,region,numPhrases,folder}) {
    const res=await fetch('https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests',{
      method:'POST',
      headers:{Authorization:'Api-Key '+key,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({folderId:folder,phrase:seed,numPhrases,regions:[region],devices:['DEVICE_ALL']}),
      signal:AbortSignal.timeout(30000),
    });
    const payload=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error('Yandex Wordstat HTTP '+res.status+' (seed '+seed+'). Paid results before this failure remain saved.');
    const top=payload.results || payload.topRequests || payload.top_requests || [];
    const associated=payload.associations || payload.associatedRequests || payload.associated_requests || [];
    return {seed,top,associated};
  },
  onProgress:({index,total,request,result,reused})=>
    console.error('Wordstat '+index+'/'+total+': '+request.seed+' -> '+result.top.length+' top rows'+(reused?' [reused]':'')),
});
const merged=new Map(),calls=[];
for(const {seed,top,associated} of checkpointed.results){
  calls.push({seed,topItems:top.length,associationItems:associated.length});
  for(const [kind,arr] of [['top',top],['association',associated]]){
    for(const row of arr){
      const phrase=String(row.phrase||row.query||row.request||'').trim();
      if(!phrase)continue;
      const raw=row.count ?? row.shows ?? row.frequency ?? null;
      const count=raw==null||raw==='' ? null : Number(raw);
      const keyText=phrase.toLocaleLowerCase('ru');
      const prev=merged.get(keyText)||{phrase,regionId:region,regionName:null,count:null,types:[],seeds:[]};
      if(Number.isFinite(count)&&count>=0)prev.count=prev.count===null?count:Math.max(prev.count,count);
      if(!prev.types.includes(kind))prev.types.push(kind);
      if(!prev.seeds.includes(seed))prev.seeds.push(seed);
      merged.set(keyText,prev);
    }
  }
}
const data={
  schemaVersion:1, source:'yandex-wordstat-topRequests',generatedAt:new Date().toISOString(),
  regions:[{id:region,name:null}],seeds,calls,rowCount:merged.size,rows:[...merged.values()],
  note:'Phrase-containing Wordstat counts may overlap. Missing counts remain null, never forced to zero.'
};
const destination=path.resolve(output);
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({saved:destination,apiCalls:checkpointed.newCalls,reusedApiCalls:checkpointed.reusedCalls,totalRequests:seeds.length,rows:data.rowCount},null,2));
