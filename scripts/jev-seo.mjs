import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_JEV_TASKS, prepareSeoJev, routeSeoJev } from '../lib/jev-seo-workflows.mjs';

const args=process.argv.slice(2), action=args[0];
const flag=name=>{
  const index=args.indexOf(name);
  return index===-1?null:args[index+1];
};
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profileFor=async task=>{
  if(!Object.hasOwn(SEO_JEV_TASKS,task)){
    throw Error('Unknown SEO task. Choose: '+Object.keys(SEO_JEV_TASKS).join(', '));
  }
  return JSON.parse(await fs.readFile(path.join(repository,SEO_JEV_TASKS[task]),'utf8'));
};
async function outputFile(filename,value){
  if(!filename)throw Error('Missing --out path');
  const full=path.resolve(filename);
  await fs.mkdir(path.dirname(full),{recursive:true,mode:0o700});
  await fs.writeFile(full,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  return full;
}
try{
  if(action==='prepare'){
    const task=flag('--task'),input=flag('--input'),output=flag('--out');
    if(!task||!input||!output)throw Error('prepare needs --task TASK --input FILE --out PRIVATE.json');
    const cap=flag('--limit')===null?100:Number(flag('--limit'));
    const [profile,data]=await Promise.all([
      profileFor(task),fs.readFile(input,'utf8').then(JSON.parse),
    ]);
    const result=prepareSeoJev({task,data,profile,limit:cap});
    const saved=await outputFile(output,result);
    console.log(JSON.stringify({
      prepared:saved,task,candidates:result.inputCandidates,
      jevSlots:result.chosenCount,skipped:result.skippedCount,
      profile:SEO_JEV_TASKS[task],paidCalls:0,
      next:'Review private prepared states, then explicitly call npm run jev:evaluate with --execute, or stop here.',
    },null,2));
  }else if(action==='route'){
    const preparedFile=flag('--prepared'),resultsFile=flag('--evaluations'),output=flag('--out');
    if(!preparedFile||!resultsFile||!output)throw Error('route needs --prepared FILE --evaluations FILE --out FILE');
    const [batch,evidence]=await Promise.all([
      fs.readFile(preparedFile,'utf8').then(JSON.parse),
      fs.readFile(resultsFile,'utf8').then(JSON.parse),
    ]);
    const profile=await profileFor(batch.task);
    const routed=routeSeoJev({prepared:batch,evidence,profile});
    const saved=await outputFile(output,routed);
    console.log(JSON.stringify({
      saved,task:routed.task,reviewQueue:routed.summary.items,
      priorities:routed.summary.priorityCounts,paidCalls:0,
      note:'Suggestions only. Nothing published, blocked, modified, or merged.',
    },null,2));
  }else{
    throw Error('Usage: npm run jev:seo -- prepare --task search-term-triage|landing-page-match|seo-cannibalization --input PRIVATE.json --out PRIVATE.json [--limit 100] | route --prepared PRIVATE.json --evaluations PRIVATE.json --out PRIVATE.json');
  }
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}
