#!/usr/bin/env node
/**
 * Validate a Yandex Wordstat region using the provider's authoritative tree.
 * Region ID never inferred solely from a city name, no API secrets logged.
 */
import { discoverYandexFolderId } from "../lib/yandex-folder.mjs";

const args=process.argv.slice(2);
const get=(name)=>args[args.indexOf(name)+1];
const name=get("--name"),expectedId=get("--expected-id");
if(!name||!/^[0-9]+$/.test(expectedId||""))throw new Error("Usage: --name <region name> --expected-id <number>");
const apiKey=String(process.env.YAIS_API||process.env.YANDEX_API_KEY||"").trim();
if(!apiKey)throw new Error("Missing Yandex API key");
const folderId=await discoverYandexFolderId({
  apiKey,
  keyId:String(process.env.YAIS_ID||"").trim(),
  folderId:String(process.env.YAIS_FOLDER_ID||process.env.YANDEX_FOLDER_ID||"").trim()
});
if(!folderId)throw new Error("Yandex folder ID unavailable");
const result=await fetch("https://searchapi.api.cloud.yandex.net/v2/wordstat/getRegionsTree",{
  method:"POST",
  headers:{"Authorization":`Api-Key ${apiKey}`,"Content-Type":"application/json"},
  body:JSON.stringify({folderId}),
  signal:AbortSignal.timeout(35000)
});
if(!result.ok)throw new Error(`Wordstat region tree HTTP ${result.status}`);
const payload=await result.json();
const normalize=(s)=>String(s||"").toLowerCase().replaceAll("ё","е").replace(/\s+/g," ").trim();
const found=new Map(),visited=new WeakSet();
function walk(value){
  if(!value||typeof value!=="object"||visited.has(value))return;
  visited.add(value);
  if(!Array.isArray(value)){
    const id=value.id??value.regionId;
    const label=value.label??value.name??value.regionName;
    if(id!=null&&label!=null&&normalize(label)===normalize(name))found.set(String(id),String(label));
  }
  for(const child of Array.isArray(value)?value:Object.values(value))walk(child);
}
walk(payload.regions||payload);
if(found.size!==1||!found.has(expectedId))throw new Error(`Region name/id mismatch: expected ${name}, id ${expectedId}, actual matches ${found.size}; stop without broad-region substitutes`);
console.log("WORDSTAT_REGION_VERIFIED",JSON.stringify({region:found.get(expectedId),id:expectedId}));
