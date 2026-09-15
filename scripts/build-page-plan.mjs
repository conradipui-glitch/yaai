import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPagePlan } from '../public/page-planner.js';

const OUT_DIR = path.resolve('results');
const ANALYSIS_PATH = path.join(OUT_DIR, 'silalesa-intents-latest.json');
const PROFILE_PATH = path.resolve('public/planner-silalesa.json');

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function writeCsv(rows, headers, projector) {
  return '\ufeff' + [headers.join(','), ...rows.map((row) => projector(row).map(csvCell).join(','))].join('\n');
}

const analysis = JSON.parse(await fs.readFile(ANALYSIS_PATH, 'utf8'));
const pagePlanner = JSON.parse(await fs.readFile(PROFILE_PATH, 'utf8'));
const plan = buildPagePlan(analysis, { id: 'silalesa', pagePlanner });

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'silalesa-page-plan-latest.json'), JSON.stringify(plan, null, 2), 'utf8');
await fs.writeFile(path.join(OUT_DIR, 'silalesa-page-plan-latest.csv'), writeCsv(
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
md.push('# Сила Леса — Page Planner');
md.push('');
md.push(`Собрано: ${plan.meta.generatedAt}`);
md.push(`Кандидатов страниц: ${plan.meta.pageCandidates}; EXPAND ${plan.meta.decisionCounts.expand || 0}; CREATE ${plan.meta.decisionCounts.create || 0}; MERGE ${plan.meta.decisionCounts.merge || 0}; HOLD ${plan.meta.decisionCounts.hold || 0}.`);
md.push('');
md.push('> План не суммирует частотности похожих запросов. Приоритет строится по сильнейшему Wordstat-сигналу, бизнес-приоритету, фокусу проекта и типу работы. Это очередь решений, а не гарантия ранжирования.');
md.push('');
md.push('| # | Когда | Решение | Тип | Страница | Max | Сильнейший запрос | Intent |');
md.push('|---:|---|---|---|---|---:|---|---|');
for (const page of plan.pages) {
  md.push(`| ${page.priorityRank} | ${page.priorityBand} | ${page.decision.toUpperCase()} | ${page.pageKind} | ${page.title.replaceAll('|','\\|')} — \`${page.path}\` | ${page.maxCount} | ${String(page.strongestPhrase || '').replaceAll('|','\\|')} | ${(page.intentIds || []).join(', ') || '—'} |`);
}
md.push('');
md.push('## Что делать сейчас');
md.push('');
for (const page of plan.pages.filter((item) => item.priorityBand === 'now')) {
  const verb = page.decision === 'expand' ? 'усилить' : page.decision === 'merge' ? 'встроить в существующую страницу' : 'создать';
  md.push(`- **#${page.priorityRank} ${page.title}** — ${verb}: \`${page.path}\`. Сильнейший сигнал: «${page.strongestPhrase}» (${page.maxCount}, ${page.strongestRegion}).`);
}
md.push('');
md.push('## HOLD — верхние запросы без публикации');
md.push('');
const holds = (plan.holdRows || []).slice(0, 30);
if (!holds.length) md.push('Нет.');
else {
  md.push('| Запрос | Регион | Count | Причина |');
  md.push('|---|---|---:|---|');
  for (const row of holds) {
    md.push(`| ${String(row.phrase || '').replaceAll('|','\\|')} | ${row.regionName || ''} | ${row.count || 0} | ${row.plannerReason || ''} |`);
  }
}
md.push('');
await fs.writeFile(path.join(OUT_DIR, 'silalesa-page-plan-summary.md'), md.join('\n'), 'utf8');

console.log(`page-plan: ${plan.pages.length} page candidates; ${plan.meta.decisionCounts.hold || 0} rows on hold`);
