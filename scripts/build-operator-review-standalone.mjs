// Create a safe, dependency-free reviewer HTML from the committed candidate
// dataset. Output contains ONLY blind case observations, never referenceDecision.
// No network/model/API calls. Run: node scripts/build-operator-review-standalone.mjs [output.html]
import fs from 'node:fs/promises';
import path from 'node:path';
import {makeBlindPack} from '../lib/operator-blind-review.mjs';

const root=new URL('../tools/operator-review/',import.meta.url);
const dataPath=new URL('../playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json',import.meta.url);
const [template,css,js,raw]=await Promise.all([
  fs.readFile(new URL('index.html',root),'utf8'),
  fs.readFile(new URL('review.css',root),'utf8'),
  fs.readFile(new URL('review.js',root),'utf8'),
  fs.readFile(dataPath,'utf8')
]);
const blind=makeBlindPack(JSON.parse(raw),raw);
const rawBlind=JSON.stringify(blind);
if(blind.cases.length!==19)throw Error('Wrong number of scenarios');
if(template.includes('embedded-blind-pack'))throw Error('Template already contains embedded data');
const escapedData=rawBlind.replace(/</g,'\\u003c').replace(/&/g,'\\u0026');
const escapedCSS=css.replace(/<\/style/gi,'<\\/style');
const escapedJS=js.replace(/<\/script/gi,'<\\/script');
const stylesheet='<link rel="stylesheet" href="./review.css">';
const scriptTag='<script defer src="./review.js"></script>';
if(!template.includes(stylesheet)||!template.includes(scriptTag))throw Error('Template structure drift');
const assembled=template
  .replace(stylesheet,'<style>'+escapedCSS+'\n[hidden]{display:none!important}</style>')
  .replace(scriptTag,'')
  .replace('</body>',
    '<script id="embedded-blind-pack" type="application/json">'+escapedData+'</script>\n'+
    '<script>'+escapedJS+'</script>\n</body>');
if(assembled.includes('<script defer src=')||assembled.includes('rel="stylesheet"'))
 throw Error('Non-standalone external assets remain');
if(/"referenceDecision"\s*:/.test(assembled)||/"model_authored_case_analysis"\s*:/.test(assembled))
 throw Error('Potential candidate reference label leakage');
if(/<script[^>]+src=/.test(assembled))throw Error('Remote scripts not allowed');
const output=path.resolve(process.argv[2]||'dist/P0-B.4-offline-review.html');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,assembled,'utf8');
console.log(JSON.stringify({output,bytes:Buffer.byteLength(assembled),cases:blind.cases.length,
  sha256:blind.datasetSha256,candidateAnswersEmbedded:false,paidCalls:0},null,2));
