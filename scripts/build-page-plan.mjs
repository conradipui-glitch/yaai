import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPagePlan } from '../public/page-planner.js';
import { loadCase } from '../lib/snapshots.mjs';
import { requireCaseId, resolveCaseId, resolveWorkspaceRoot, workspacePaths } from '../lib/workspace.mjs';

const WORKSPACE_ROOT = resolveWorkspaceRoot();
const PATHS = workspacePaths(WORKSPACE_ROOT);
const OUT_DIR = PATHS.results;
const CASE_ID = requireCaseId(resolveCaseId());
const caseConfig = await loadCase(CASE_ID, WORKSPACE_ROOT);
const PREFIX = caseConfig.resultPrefix;
const ANALYSIS_PATH = path.join(OUT_DIR, `${PREFIX}-intents-latest.json`);
const PROFILE_PATH = path.join(PATHS.planners, `${PREFIX}.json`);

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function writeCsv(rows, headers, projector) {
  return '\ufeff' + [headers.join(','), ...rows.map((row) => projector(row).map(csvCell).join(','))].join('\n');
}

const analysis = JSON.parse(await fs.readFile(ANALYSIS_PATH, 'utf8'));
const pagePlanner = JSON.parse(await fs.readFile(PROFILE_PATH, 'utf8'));
const plan = buildPagePlan(analysis, { id: PREFIX, pagePlanner });

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-page-plan-latest.json`), JSON.stringify(plan, null, 2), 'utf8');
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-page-plan-latest.csv`), writeCsv(
  plan.pages,
  ['rank','priority_band','decision','page_kind','title','path','business_priority','planner_score','phrase_count','max_count','strongest_phrase','strongest_region','regions','intent_ids','top_queries','note'],
  (page) => [
    page.priorityRank,
    page.priorityBand,
    page.decision,
    page.pageKind,
    page.title,
    page.path,
    page.businessPriority,
    page.plannerScore,
    page.phraseCount,
    page.maxCount,
    page.strongestPhrase,
    page.strongestRegion,
    (page.regions || []).map((r) => `${r.regionName}:${r.maxCount}`).join('|'),
    (page.intentIds || []).join('|'),
    (page.topQueries || []).map((q) => `${q.phrase}:${q.count}`).join('|'),
    page.note || '',
  ]
), 'utf8');

const md = [];
md.push(`# ${caseConfig.name} РІР‚вЂќ Page Planner`);
md.push('');
md.push(`Р РЋР С•Р В±РЎР‚Р В°Р Р…Р С•: ${plan.meta.generatedAt}`);
md.push(`Р С™Р В°Р Р…Р Т‘Р С‘Р Т‘Р В°РЎвЂљР С•Р Р† РЎРѓРЎвЂљРЎР‚Р В°Р Р…Р С‘РЎвЂ : ${plan.meta.pageCandidates}; EXPAND ${plan.meta.decisionCounts.expand || 0}; CREATE ${plan.meta.decisionCounts.create || 0}; MERGE ${plan.meta.decisionCounts.merge || 0}; HOLD ${plan.meta.decisionCounts.hold || 0}.`);
md.push('');
md.push('> Р СџР В»Р В°Р Р… Р Р…Р Вµ РЎРѓРЎС“Р СР СР С‘РЎР‚РЎС“Р ВµРЎвЂљ РЎвЂЎР В°РЎРѓРЎвЂљР С•РЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р С—Р С•РЎвЂ¦Р С•Р В¶Р С‘РЎвЂ¦ Р В·Р В°Р С—РЎР‚Р С•РЎРѓР С•Р Р†. Р СџРЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљ РЎРѓРЎвЂљРЎР‚Р С•Р С‘РЎвЂљРЎРѓРЎРЏ Р С—Р С• РЎРѓР С‘Р В»РЎРЉР Р…Р ВµР в„–РЎв‚¬Р ВµР СРЎС“ Wordstat-РЎРѓР С‘Р С–Р Р…Р В°Р В»РЎС“, Р В±Р С‘Р В·Р Р…Р ВµРЎРѓ-Р С—РЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљРЎС“, РЎвЂћР С•Р С”РЎС“РЎРѓРЎС“ Р С—РЎР‚Р С•Р ВµР С”РЎвЂљР В° Р С‘ РЎвЂљР С‘Р С—РЎС“ РЎР‚Р В°Р В±Р С•РЎвЂљРЎвЂ№. Р В­РЎвЂљР С• Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘РЎРЉ РЎР‚Р ВµРЎв‚¬Р ВµР Р…Р С‘Р в„–, Р В° Р Р…Р Вµ Р С–Р В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎРЏ РЎР‚Р В°Р Р…Р В¶Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ.');
md.push('');
md.push('| # | Р С™Р С•Р С–Р Т‘Р В° | Р В Р ВµРЎв‚¬Р ВµР Р…Р С‘Р Вµ | Р СћР С‘Р С— | Р РЋРЎвЂљРЎР‚Р В°Р Р…Р С‘РЎвЂ Р В° | Max | Р РЋР С‘Р В»РЎРЉР Р…Р ВµР в„–РЎв‚¬Р С‘Р в„– Р В·Р В°Р С—РЎР‚Р С•РЎРѓ | Intent |');
md.push('|---:|---|---|---|---|---:|---|---|');
for (const page of plan.pages) {
  md.push(`| ${page.priorityRank} | ${page.priorityBand} | ${page.decision.toUpperCase()} | ${page.pageKind} | ${page.title.replaceAll('|','\\|')} РІР‚вЂќ \`${page.path}\` | ${page.maxCount} | ${String(page.strongestPhrase || '').replaceAll('|','\\|')} | ${(page.intentIds || []).join(', ') || 'РІР‚вЂќ'} |`);
}
md.push('');
md.push('## Р В§РЎвЂљР С• Р Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎРѓР ВµР в„–РЎвЂЎР В°РЎРѓ');
md.push('');
for (const page of plan.pages.filter((item) => item.priorityBand === 'now')) {
  const verb = page.decision === 'expand' ? 'РЎС“РЎРѓР С‘Р В»Р С‘РЎвЂљРЎРЉ' : page.decision === 'merge' ? 'Р Р†РЎРѓРЎвЂљРЎР‚Р С•Р С‘РЎвЂљРЎРЉ Р Р† РЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°РЎС“РЎР‹ РЎРѓРЎвЂљРЎР‚Р В°Р Р…Р С‘РЎвЂ РЎС“' : 'РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ';
  md.push(`- **#${page.priorityRank} ${page.title}** РІР‚вЂќ ${verb}: \`${page.path}\`. Р РЋР С‘Р В»РЎРЉР Р…Р ВµР в„–РЎв‚¬Р С‘Р в„– РЎРѓР С‘Р С–Р Р…Р В°Р В»: Р’В«${page.strongestPhrase}Р’В» (${page.maxCount}, ${page.strongestRegion}).`);
}
md.push('');
md.push('## HOLD РІР‚вЂќ Р Р†Р ВµРЎР‚РЎвЂ¦Р Р…Р С‘Р Вµ Р В·Р В°Р С—РЎР‚Р С•РЎРѓРЎвЂ№ Р В±Р ВµР В· Р С—РЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂ Р С‘Р С‘');
md.push('');
const holds = (plan.holdRows || []).slice(0, 30);
if (!holds.length) md.push('Р СњР ВµРЎвЂљ.');
else {
  md.push('| Р вЂ”Р В°Р С—РЎР‚Р С•РЎРѓ | Р В Р ВµР С–Р С‘Р С•Р Р… | Count | Р СџРЎР‚Р С‘РЎвЂЎР С‘Р Р…Р В° |');
  md.push('|---|---|---:|---|');
  for (const row of holds) {
    md.push(`| ${String(row.phrase || '').replaceAll('|','\\|')} | ${row.regionName || ''} | ${row.count || 0} | ${row.plannerReason || ''} |`);
  }
}
md.push('');
await fs.writeFile(path.join(OUT_DIR, `${PREFIX}-page-plan-summary.md`), md.join('\n'), 'utf8');

console.log(`page-plan [${PREFIX}]: ${plan.pages.length} page candidates; ${plan.meta.decisionCounts.hold || 0} rows on hold`);
