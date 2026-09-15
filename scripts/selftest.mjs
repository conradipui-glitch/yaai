import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { analyzeRows } from '../lib/analyze.mjs';
import { buildPagePlan } from '../public/page-planner.js';

const preset = JSON.parse(await fs.readFile(new URL('../presets/silalesa.json', import.meta.url), 'utf8'));
const pagePlanner = JSON.parse(await fs.readFile(new URL('../public/planner-silalesa.json', import.meta.url), 'utf8'));
const rows = [
  { phrase: 'баня под ключ в омске', regionId: '66', regionName: 'Омск', count: 469, types: ['top'], seeds: ['баня под ключ'] },
  { phrase: 'фундамент под баню', regionId: '66', regionName: 'Омск', count: 116, types: ['top'], seeds: ['фундамент под баню'] },
  { phrase: 'как выбрать фундамент под баню', regionId: '66', regionName: 'Омск', count: 41, types: ['top'], seeds: ['фундамент под баню'] },
  { phrase: 'бурение скважин', regionId: '66', regionName: 'Омск', count: 486, types: ['top'], seeds: ['бурение скважин'] },
  { phrase: 'совсем непонятная тестовая формулировка', regionId: '66', regionName: 'Омск', count: 9, types: ['top'], seeds: ['готовая баня'] },
  { phrase: 'борщевая заправка на зиму в банках', regionId: '66', regionName: 'Омск', count: 407, types: ['association'], seeds: ['баня зимой'] },
  { phrase: 'зимние ботинки', regionId: '66', regionName: 'Омск', count: 1143, types: ['association'], seeds: ['баня зимой'] }
];

const topOnly = analyzeRows(rows, preset, { includeTop: true, includeAssociations: false });
assert.equal(topOnly.meta.eligibleRows, 5);
assert.equal(topOnly.meta.assignedRows, 3);
assert.equal(topOnly.meta.unassignedRows, 2);
assert.equal(topOnly.meta.filteredByType, 2);
assert.equal(topOnly.meta.queryTypeCounts.commercial, 2);
assert.equal(topOnly.meta.queryTypeCounts.informational, 2);
assert.equal(topOnly.meta.queryTypeCounts.unmapped, 1);
assert.equal(topOnly.meta.nextActionCounts.landing, 2);
assert.equal(topOnly.meta.nextActionCounts.guide, 2);
assert.equal(topOnly.meta.nextActionCounts.hold, 1);

const foundation = topOnly.assignedRows.find((row) => row.phrase === 'фундамент под баню');
assert.equal(foundation.intentId, 'B14');
assert.equal(foundation.queryType, 'informational');
assert.equal(foundation.nextAction, 'guide');

const bathCommercial = topOnly.assignedRows.find((row) => row.phrase === 'баня под ключ в омске');
assert.equal(bathCommercial.queryType, 'commercial');
assert.equal(bathCommercial.nextAction, 'landing');

const drilling = topOnly.classifiedRows.find((row) => row.phrase === 'бурение скважин');
assert.equal(drilling.analysisStatus, 'unassigned');
assert.equal(drilling.queryType, 'commercial');
assert.equal(drilling.querySource, 'commercial-head');
assert.equal(drilling.nextAction, 'landing');

const unknown = topOnly.classifiedRows.find((row) => row.phrase === 'совсем непонятная тестовая формулировка');
assert.equal(unknown.queryType, 'unmapped');
assert.equal(unknown.nextAction, 'hold');

const b14Summary = topOnly.summary.find((item) => item.intentId === 'B14' && item.regionId === '66');
assert.equal(b14Summary.dominantQueryType, 'informational');
assert.equal(b14Summary.nextAction, 'guide');

const withAssociations = analyzeRows(rows, preset, { includeTop: true, includeAssociations: true });
assert.equal(withAssociations.meta.negativeRows, 2);
assert.equal(withAssociations.meta.queryTypeCounts.noise, 2);
assert.equal(withAssociations.meta.nextActionCounts.hold, 3);
assert.ok(withAssociations.classifiedRows.some((row) => row.queryType === 'noise' && row.analysisStatus === 'negative'));

const plan = buildPagePlan(topOnly, { id: 'silalesa', pagePlanner });
const bathPlan = plan.pages.find((page) => page.planId === 'bath-ready-main');
assert.ok(bathPlan);
assert.equal(bathPlan.decision, 'expand');
assert.equal(bathPlan.path, '/mobilnaya-banya-omsk/');

const foundationPlan = plan.pages.find((page) => page.planId === 'guide-foundation');
assert.ok(foundationPlan);
assert.equal(foundationPlan.decision, 'create');
assert.equal(foundationPlan.pageKind, 'guide');
assert.equal(foundationPlan.path, '/guides/bani/fundament-dlya-mobilnoy-bani/');

const drillingPlan = plan.pages.find((page) => page.planId === 'service-drilling');
assert.ok(drillingPlan);
assert.equal(drillingPlan.decision, 'expand');
assert.equal(drillingPlan.path, '/burenie-skvazhiny-omsk/');

assert.ok(plan.holdRows.some((row) => row.phrase === 'совсем непонятная тестовая формулировка'));
assert.ok(plan.pages.every((page) => Number.isFinite(page.plannerScore)));
assert.equal(plan.pages[0].priorityRank, 1);

// --- TOHARO case (generic pipeline smoke) ---
const totharoPreset = JSON.parse(await fs.readFile(new URL('../presets/totharo.json', import.meta.url), 'utf8'));
const totharoPlanner = JSON.parse(await fs.readFile(new URL('../public/planner-totharo.json', import.meta.url), 'utf8'));
const totharoRows = [
  { phrase: 'вайб кодинг что это', regionId: '225', regionName: 'Россия', count: 1500, types: ['top'], seeds: ['вайб кодинг'] },
  { phrase: 'claude code skills как настроить', regionId: '225', regionName: 'Россия', count: 400, types: ['top'], seeds: ['claude code skills'] },
  { phrase: 'как выбрать нейросеть для кода', regionId: '225', regionName: 'Россия', count: 700, types: ['top'], seeds: ['нейросеть для кода'] },
  { phrase: 'нейросеть раздеть фото', regionId: '225', regionName: 'Россия', count: 900, types: ['top'], seeds: ['нейросети'] },
  { phrase: 'квантовый телепорт для кота', regionId: '225', regionName: 'Россия', count: 12, types: ['top'], seeds: ['нейросети'] },
];

const totharoAnalysis = analyzeRows(totharoRows, totharoPreset, { includeTop: true, includeAssociations: false });
assert.equal(totharoAnalysis.meta.negativeRows, 1);
assert.equal(totharoAnalysis.meta.unassignedRows, 1);
const vaybRow = totharoAnalysis.assignedRows.find((row) => row.phrase === 'вайб кодинг что это');
assert.ok(vaybRow);
assert.equal(vaybRow.intentId, 'VC01');
assert.equal(vaybRow.nextAction, 'guide');
const skillsRow = totharoAnalysis.assignedRows.find((row) => row.phrase === 'claude code skills как настроить');
assert.ok(skillsRow);
assert.equal(skillsRow.intentId, 'TL02');
const modelRow = totharoAnalysis.assignedRows.find((row) => row.phrase === 'как выбрать нейросеть для кода');
assert.ok(modelRow);
assert.equal(modelRow.intentId, 'MD01');

const totharoPlan = buildPagePlan(totharoAnalysis, { id: 'totharo', pagePlanner: totharoPlanner });
const vaybPlan = totharoPlan.pages.find((page) => page.planId === 'plan-vayb');
assert.ok(vaybPlan);
assert.equal(vaybPlan.decision, 'create');
assert.equal(vaybPlan.path, '/blog/chto-takoe-vayb-koding/');
assert.equal(vaybPlan.pageKind, 'guide');
const skillsPlan = totharoPlan.pages.find((page) => page.planId === 'post-skills');
assert.ok(skillsPlan);
assert.equal(skillsPlan.decision, 'expand');
assert.ok(totharoPlan.holdRows.some((row) => row.phrase === 'нейросеть раздеть фото'));
assert.ok(totharoPlan.holdRows.some((row) => row.phrase === 'квантовый телепорт для кота'));

console.log('selftest: ok');
