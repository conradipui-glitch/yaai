import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPainReportDocument } from '../lib/evidence-report.mjs';
import { renderPainReportHtml } from '../lib/evidence-report-html.mjs';

const args = process.argv.slice(2);
function flag(name) {
  const inline = args.find(x => x.startsWith(name + '='));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
}
const input = flag('--map'), htmlOut = flag('--html'), qualityInput = flag('--quality');
if (!input || !htmlOut || !/\.html?$/i.test(htmlOut)) {
  throw Error('Usage: node scripts/render-pain-report.mjs --map /private/pain-map.json --html /private/report.html [--quality /private/quality.json] [--json /private/report.json]. No paid API calls.');
}
const htmlPath = path.resolve(htmlOut);
const jsonPath = path.resolve(flag('--json') || htmlPath.replace(/\.html?$/i, '.json'));
const inputs = [input, qualityInput].filter(Boolean).map(x=>path.resolve(x));
if (new Set([...inputs,htmlPath,jsonPath]).size !== inputs.length + 2) {
  throw Error('Source, quality and output paths must be distinct.');
}
if (htmlPath === jsonPath) throw Error('HTML and JSON destinations must differ.');
// Never overwrite or replace earlier research output on an automatic retry.
for (const filename of [htmlPath,jsonPath]) {
  try {
    await fs.lstat(filename);
    throw Error('Report output already exists: ' + filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [map, quality, css, js] = await Promise.all([
  fs.readFile(path.resolve(input),'utf8').then(JSON.parse),
  qualityInput ? fs.readFile(path.resolve(qualityInput),'utf8').then(JSON.parse) : null,
  fs.readFile(path.join(root,'public/evidence-report.css'),'utf8'),
  fs.readFile(path.join(root,'public/evidence-report.js'),'utf8'),
]);
const report = buildPainReportDocument(map,{quality});
const html = renderPainReportHtml(report,{css,script:js});
await fs.mkdir(path.dirname(htmlPath),{recursive:true});
await fs.mkdir(path.dirname(jsonPath),{recursive:true});
await fs.writeFile(jsonPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
await fs.writeFile(htmlPath,html,{flag:'wx',mode:0o600});
console.log(JSON.stringify({
  html:htmlPath,json:jsonPath,topic:report.topic,
  observations:report.observations.length,claims:report.claims.length,
  humanQuality:report.quality?.status || 'not_provided',
  paidApiCalls:0,note:'All hypothesis claims remain unverified unless evaluated using a valid human-review quality report.',
},null,2));
