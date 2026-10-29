#!/usr/bin/env node
// Local, read-only except explicit output files. P0-B.4 manual independent review.
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeBlindPack,makeReviewTemplate,inspectReview,compareReviewed} from '../lib/operator-blind-review.mjs';

const root=new URL('../playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json',import.meta.url);
function arg(name){
  const i=process.argv.indexOf(name);
  return i>=0?process.argv[i+1]:null;
}
function requireArg(name){
  const v=arg(name);
  if(!v || v.startsWith('--'))throw Error('Missing '+name);
  return resolve(v);
}
function usage(){
  return 'Usage:\n'+
  '  node scripts/operator-blind-review.mjs prepare --blind PATH --template PATH\n'+
  '  node scripts/operator-blind-review.mjs verify --blind PATH --review PATH\n'+
  '  node scripts/operator-blind-review.mjs compare --blind PATH --review PATH\n'+
  'For independent review: never open original dataset referenceDecision first; use blind export.\n';
}
const cmd=process.argv[2];
if(!['prepare','verify','compare'].includes(cmd)){console.error(usage());process.exitCode=2;}
else {
  try{
    const raw=await fs.readFile(root,'utf8');
    const dataset=JSON.parse(raw);
    if(cmd==='prepare'){
      const blindPath=requireArg('--blind'),templatePath=requireArg('--template');
      if(blindPath===templatePath)throw Error('Use separate blind and template paths');
      const blind=makeBlindPack(dataset,raw);
      const template=makeReviewTemplate(blind);
      // wx prevents overwrite of an existing human review or blind packet.
      await fs.writeFile(blindPath,JSON.stringify(blind,null,2)+'\n',{flag:'wx',mode:0o600});
      try{await fs.writeFile(templatePath,JSON.stringify(template,null,2)+'\n',{flag:'wx',mode:0o600});}
      catch(e){
        // Do not silently replace an existing reviewer file.
        console.error('Blind packet was written, but the template write failed. Paths:',blindPath,templatePath);
        throw e;
      }
      console.log(JSON.stringify({blindPath,templatePath,scenarios:blind.cases.length,
        reviewStatus:'not_started',containsCandidateDecisions:false,networkCalls:0},null,2));
    } else {
      const blind=JSON.parse(await fs.readFile(requireArg('--blind'),'utf8'));
      const review=JSON.parse(await fs.readFile(requireArg('--review'),'utf8'));
      const status=inspectReview(blind,review);
      if(cmd==='verify'){
        console.log(JSON.stringify(status,null,2));
        if(!status.readyForAdjudication)process.exitCode=2;
      }else{
        const comparison=compareReviewed(blind,review,dataset,raw);
        console.log(JSON.stringify(comparison,null,2));
      }
    }
  }catch(e){console.error('Review gate: '+e.message);process.exitCode=1;}
}
