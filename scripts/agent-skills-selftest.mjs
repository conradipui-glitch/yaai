import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOLS } from '../mcp-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const skillsRoot = path.join(root, '.agents', 'skills');

const expected = [
  'yandex-keyword-research',
  'page-plan',
  'rank-tracker',
  'competitor-evidence',
  'distribution-intelligence',
  'cheap-evaluation',
  'seo-review',
  'content-gap',
  'seo-report',
];

const knownTools = new Set(TOOLS.map((tool) => tool.name));
const referencedTools = new Set();

for (const name of expected) {
  const file = path.join(skillsRoot, name, 'SKILL.md');
  const source = await fs.readFile(file, 'utf8');

  assert.match(source, /^---\nname: [a-z0-9-]+\ndescription: ".+"\n---\n/);
  assert.match(source, new RegExp(`^---\\nname: ${name}\\n`));
  assert.ok(source.includes('## Goal'), `${name} must explain its goal`);
  assert.ok(source.includes('## Guardrails') || source.includes('## Writing rules'),
    `${name} must define guardrails or writing rules`);

  for (const match of source.matchAll(/\`(yaai_[a-z0-9_]+)\`/g)) {
    referencedTools.add(match[1]);
    assert.ok(knownTools.has(match[1]), `${name} references unknown MCP tool ${match[1]}`);
  }
}

for (const requiredTool of [
  'yaai_workspace_overview',
  'yaai_analyze_latest',
  'yaai_build_page_plan',
  'yaai_compare_snapshots',
  'yaai_rank_tracker',
  'yaai_serp_evidence',
  'yaai_distribution_evidence',
  'yaai_evaluation_evidence',
  'yaai_webmaster_overlap',
]) {
  assert.ok(referencedTools.has(requiredTool), `skills should cover MCP tool ${requiredTool}`);
}

console.log(`agent skills selftest: ok (${expected.length} skills, ${referencedTools.size} MCP tools referenced)`);
