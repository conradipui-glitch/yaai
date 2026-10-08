import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const workflows=[
  'jev-smoke','pain-discovery-smoke','serp-smoke','wordstat-smoke',
  'transcript-smoke','wordstat-dynamics','omsk-construction-pain',
  'omsk-pain-reclassify','pain-quality-pilot','pain-quality-relevance-pilot',
];
for (const name of workflows) {
  const text=await fs.readFile('.github/workflows/'+name+'.yml','utf8');
  assert.match(text,/^on:\s*$/m,'Expected on: section for '+name);
  assert.match(text,/^  workflow_dispatch:/m,'Missing manual workflow_dispatch for '+name);
  assert.doesNotMatch(text,/^  push:/m,'Unexpected automatic push billing risk: '+name);
}
const pilot=await fs.readFile('.github/workflows/pain-quality-pilot.yml','utf8');
assert.match(pilot,/resume_run_id:/);
assert.match(pilot,/confirm_paid_requests:/);
assert.match(pilot,/default: false/);
assert.match(pilot,/actions\/download-artifact@v4/);
assert.match(pilot,/scripts\/pain-pilot-resume\.mjs/);
assert.match(pilot,/if: always\(\)/);
assert.match(pilot,/actions\/upload-artifact@v4/);
const omsk=await fs.readFile('.github/workflows/omsk-construction-pain.yml','utf8');
assert.match(omsk,/resume_run_id:/);
assert.match(omsk,/confirm_paid_requests:/);
assert.match(omsk,/default: false/);
assert.match(omsk,/actions\/download-artifact@v4/);
assert.match(omsk,/scripts\/omsk-pain-resume\.mjs/);
assert.match(omsk,/if: always\(\)/);
assert.match(omsk,/actions\/upload-artifact@v4/);
assert.doesNotMatch(omsk,/^\s+run: node scripts\/pain-wordstat\.mjs/m,
  'Omsk workflow must route all paid calls through the guarded recovery runner');
const dynamics=await fs.readFile('.github/workflows/wordstat-dynamics.yml','utf8');
assert.match(dynamics,/if: inputs\.confirm_live == true/);
console.log('live API workflows require manual launch: '+workflows.length+' guarded');
