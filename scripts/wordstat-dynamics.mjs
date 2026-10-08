#!/usr/bin/env node
/**
 * Generic guarded Wordstat GetDynamics collector.
 * Input is an external, validated client/workspace manifest; no client case or
 * API credentials belong in this reusable engine repository.
 * The command never performs live API calls without --execute.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { discoverYandexFolderId } from "../lib/yandex-folder.mjs";

const ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/wordstat";
const argv = process.argv.slice(2);
function option(name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] || null;
}
function fail(message) { throw new Error(message); }
const inputFile=option("--input");
const outputFile=option("--out");
const summaryFile=option("--summary");
const execute=argv.includes("--execute");
if (!inputFile || !outputFile || !summaryFile) {
  fail("Usage: node scripts/wordstat-dynamics.mjs --input <local-manifest.json> --out <monthly.csv> --summary <summary.json> [--execute]");
}
if (!execute) {
  console.log("DRY_RUN: no paid Wordstat API calls made; add --execute for explicitly requested live research.");
}
const manifest=JSON.parse(await fs.readFile(inputFile,"utf8"));
const codes=new Set();
if (manifest.schemaVersion!==1 || !Array.isArray(manifest.services) || manifest.services.length<1 || manifest.services.length>20) {
  fail("Expected version 1 manifest with 1-20 service/query pairs");
}
if (!manifest.region || String(manifest.region).trim().length<3) fail("Valid region name is required");
if (!/^\d{4}-01-01$/.test(manifest.from) || !/^\d{4}-12-31$/.test(manifest.to)) {
  fail("Two full calendar year boundaries required, YYYY-01-01 to YYYY-12-31");
}
const firstYear=Number(manifest.from.slice(0,4)),lastYear=Number(manifest.to.slice(0,4));
if (lastYear-firstYear!==1 || lastYear>=new Date().getUTCFullYear())fail("Exactly two COMPLETED calendar years required");
if (manifest.period!=="PERIOD_MONTHLY")fail("Expected MONTHLY period");
if (JSON.stringify(manifest.devices)!==JSON.stringify(["DEVICE_ALL"]))fail("Expected all-device comparison");
for (const s of manifest.services) {
  if (!s || !/^[a-z][a-z0-9-]{1,60}$/.test(s.code)||codes.has(s.code))fail("Each service needs a unique safe code");
  if (typeof s.phrase!=="string"||s.phrase.length<3||s.phrase.length>200||/[\r\n]/.test(s.phrase))fail("Bad service phrase");
  if (/["!\[\]|()]/.test(s.phrase))fail("Only bare phrases are supported in monthly dynamics: no unsupported Wordstat operators");
  codes.add(s.code);
}
const months=[];
for (let year=firstYear;year<=lastYear;year++)for (let m=1;m<=12;m++)months.push(`${year}-${String(m).padStart(2,"0")}`);

if (!execute) {
  console.log(JSON.stringify({region:manifest.region,services:manifest.services.length,months:months.length,estimatedCalls:manifest.services.length}));
  process.exit(0);
}
const apiKey=String(process.env.YAIS_API||process.env.YANDEX_API_KEY||"").trim();
const keyId=String(process.env.YAIS_ID||"").trim();
let folderId=String(process.env.YAIS_FOLDER_ID||process.env.YANDEX_FOLDER_ID||"").trim();
if (!apiKey)fail("Wordstat API key is not configured in the execution environment");
folderId=await discoverYandexFolderId({apiKey,keyId,folderId});
if (!folderId)fail("Wordstat folder ID not configured or discoverable; check GitHub Actions secret mapping");

/** No credentials, folder IDs, or full API error bodies are logged. */
async function post(endpoint,body) {
  for(let attempt=0;attempt<3;attempt++){
    let res;
    try {
      res=await fetch(`${ENDPOINT}/${endpoint}`,{
        method:"POST",headers:{"Authorization":`Api-Key ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({...body,folderId}),signal:AbortSignal.timeout(25000)
      });
    } catch(error) {
      // Socket resets and AbortSignal timeouts are transient. Never echo the
      // request headers/credentials, nor confuse an API timeout with zero demand.
      if(attempt===2)fail(`Yandex Wordstat ${endpoint}: network timeout after three attempts; partial results, if any, were checkpointed`);
      console.warn(`WORDSTAT_RETRY ${endpoint} after network interruption (attempt ${attempt+1}/3)`);
      await new Promise(resolve=>setTimeout(resolve,1400*(attempt+1)));
      continue;
    }
    if((res.status===429||res.status>=500)&&attempt<2){
      console.warn(`WORDSTAT_RETRY ${endpoint} after HTTP ${res.status} (attempt ${attempt+1}/3)`);
      await new Promise(resolve=>setTimeout(resolve,1400*(attempt+1)));continue;
    }
    if(!res.ok)fail(`Yandex Wordstat ${endpoint}: HTTP ${res.status}, response details suppressed`);
    return await res.json();
  }
  fail("Wordstat retries exhausted");
}
const norm=(s)=>String(s||"").toLowerCase().replaceAll("ё","е").replace(/\s+/g," ").trim();
const tree=await post("getRegionsTree",{});
const regionMatches=[];
const seen=new WeakSet();
function traverse(node){
  if(!node||typeof node!=="object"||seen.has(node))return;
  seen.add(node);
  if(!Array.isArray(node)){
    const id=node.id??node.regionId;
    const name=node.label??node.name??node.regionName;
    if(id!=null&&name!=null&&norm(name)===norm(manifest.region))regionMatches.push({id:String(id),name:String(name)});
  }
  for(const child of Array.isArray(node)?node:Object.values(node))traverse(child);
}
traverse(tree.regions||[]);
const unique=new Map(regionMatches.map(x=>[x.id,x]));
if(unique.size!==1)fail(`Expected one exact named Wordstat region ${manifest.region}; matched IDs: ${unique.size}`);
const region=[...unique.values()][0];

const resultRows=[];
for(const [index,service] of manifest.services.entries()){
  const data=await post("dynamics",{
    phrase:service.phrase,
    period:"PERIOD_MONTHLY",
    fromDate:`${manifest.from}T00:00:00Z`,
    toDate:`${manifest.to}T23:59:59Z`,
    regions:[region.id],
    devices:["DEVICE_ALL"]
  });
  const records=Array.isArray(data.results)?data.results:[];
  const byMonth=new Map();
  for(const item of records){
    const month=String(item.date||"").slice(0,7);
    if(!months.includes(month))continue;
    const raw=String(item.count??"");
    // API may return a month with no count at all for sparse phrases.
    // Do not invent 0; retain null and exclude incomplete services from ranking.
    if(raw==="") {
      if(!byMonth.has(month))byMonth.set(month,null);
      continue;
    }
    if(!/^[0-9]+$/.test(raw))fail(`Non-integer monthly count for ${service.code}, month ${month}, value type ${typeof item.count}`);
    const count=Number(raw);
    if(!Number.isSafeInteger(count)||count<0)fail(`Out-of-range monthly count for ${service.code}, month ${month}`);
    if(byMonth.has(month)) {
      if(byMonth.get(month)===count)continue;
      if(byMonth.get(month)===null){byMonth.set(month,count);continue;}
      fail(`Conflicting repeated month for ${service.code}, month ${month}: counts ${byMonth.get(month)} versus ${count}; refusing to aggregate blindly`);
    }
    byMonth.set(month,count);
  }
  // Omitted months are also unknown, not automatically 0.
  for(const month of months)resultRows.push({month,service:service.code,queries:byMonth.get(month)??null,region:region.name,phrase:service.phrase});
  const known=months.filter(month=>byMonth.get(month)!==null&&byMonth.has(month)).length;
  console.log(`WORDSTAT_MONTHLY_PROGRESS ${index+1}/${manifest.services.length} (known months ${known}/24; others explicitly unknown)`);
  // Persist each successfully collected direction before attempting the next
  // metered call. The partial CSV is never mistaken for a complete dataset.
  const checkpointPath=outputFile.replace(/\.csv$/, "-partial.csv");
  const csvCell=(value)=>'"'+String(value).replaceAll('"','""')+'"';
  await fs.mkdir(path.dirname(checkpointPath),{recursive:true});
  await fs.writeFile(checkpointPath,[
    "month,service,queries,region,phrase",
    ...resultRows.map(r=>[r.month,r.service,r.queries??"",r.region,r.phrase].map(csvCell).join(","))
  ].join("\\n")+"\\n","utf8");
  await new Promise(resolve=>setTimeout(resolve,800));
}
if(resultRows.length!==months.length*manifest.services.length)fail("Missing rows for complete seasonal baseline");
const incompleteServices=manifest.services.map(s=>{
  const missing=resultRows.filter(r=>r.service===s.code && r.queries===null).map(r=>r.month);
  return {code:s.code,missing};
}).filter(x=>x.missing.length);
const excluded=new Set(incompleteServices.map(x=>x.code));
const validServices=manifest.services.filter(s=>!excluded.has(s.code));
if(validServices.length<2)fail("Insufficient full service histories to compare any monthly leaders");
const annual=new Map(validServices.map(s=>[s.code,0]));
for(const row of resultRows)if(annual.has(row.service))annual.set(row.service,annual.get(row.service)+row.queries);
const monthLeaders=[];
for(let month=1;month<=12;month++){
  const key=String(month).padStart(2,"0");
  const candidates=validServices.map(s=>({
    code:s.code,
    avg:resultRows.filter(r=>r.service===s.code&&r.month.endsWith("-"+key)).reduce((a,b)=>a+b.queries,0)/2
  })).sort((a,b)=>b.avg-a.avg);
  const [first,second]=candidates;
  monthLeaders.push({month:key,first,second,clearLead: incompleteServices.length===0 && first.avg>=20 && first.avg>=second.avg*1.2 && first.avg!==second.avg});
}
const csv=(s)=>'"'+String(s).replaceAll('"','""')+'"';
const header="month,service,queries,region,phrase";
const csvRows=resultRows.map(r=>[r.month,r.service,r.queries??"",r.region,r.phrase].map(csv).join(","));
const summary={
  source:"Yandex Wordstat GetDynamics",dataPeriod:`${firstYear}–${lastYear}`,generatedAt:new Date().toISOString(),
  region:region.name,regionCode:region.id,devices:"DEVICE_ALL",queryMode:"contains phrase",
  serviceCount:manifest.services.length,observations:resultRows.length,
  knownObservations:resultRows.filter(r=>r.queries!==null).length,
  incompleteServices,
  rankingComplete:incompleteServices.length===0,
  phraseNote:"Selected phrase-containing queries overlap. Blank count means NOT REPORTED, never 0. Rankings are partial when any service is incomplete. Intent/overlap requires human review.",
  annualRanks:[...annual].map(([service,queries])=>({service,queries})).sort((a,b)=>b.queries-a.queries),
  monthLeaders
};
await fs.mkdir(path.dirname(outputFile),{recursive:true});
await fs.mkdir(path.dirname(summaryFile),{recursive:true});
await fs.writeFile(outputFile,[header,...csvRows].join("\n")+"\n","utf8");
await fs.writeFile(summaryFile,JSON.stringify(summary,null,2)+"\n","utf8");
await fs.rm(outputFile.replace(/\.csv$/, "-partial.csv"),{force:true});
console.log("WORDSTAT_MONTHLY_SUCCESS",JSON.stringify({region:summary.region,period:summary.dataPeriod,services:summary.serviceCount,observations:summary.observations,clearMonths:monthLeaders.filter(x=>x.clearLead).length,missingCounts:resultRows.length-resultRows.filter(r=>r.queries!==null).length}));
