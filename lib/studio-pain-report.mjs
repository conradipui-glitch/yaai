import fs from 'node:fs/promises';
import path from 'node:path';
import { safeConfigId } from './workspace.mjs';
import { PAIN_CATEGORIES } from './pain-discovery.mjs';

// The only source Studio reads is a deliberately placed, per-case Evidence Report v1.
// Never scan other projects, let a URL pick a path, or serve raw private JSON.
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_OBSERVATIONS = 500;
const MAX_CLAIMS = 9;

const fail = (message, status = 422) => {
  const error = new Error('Studio Pain Discovery: ' + message);
  error.status = status;
  throw error;
};
const int = n => Number.isInteger(n) && n >= 0;
const safeText = (value, max = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('некорректный текст отчёта');
  return value;
};
const optionalCount = n => n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0);
async function regularFile(filename, optional = false) {
  let stat;
  try { stat = await fs.lstat(filename); }
  catch (err) {
    if (optional && err.code === 'ENOENT') return null;
    throw err;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) fail('небезопасный или слишком большой файл отчёта');
  return stat;
}
async function directory(dirname, optional = false) {
  let stat;
  try { stat = await fs.lstat(dirname); }
  catch (err) {
    if (optional && err.code === 'ENOENT') return false;
    throw err;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('небезопасная папка рабочего пространства');
  return true;
}
function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) fail('некорректная ссылка источника');
  let url;
  try { url = new URL(value); } catch { fail('некорректная ссылка источника'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    fail('запрещённая ссылка источника');
  }
  return url.href;
}
function projectReport(report) {
  if (!report || report.schemaVersion !== 1 || report.source !== 'yaai-evidence-report' ||
      report.reportType !== 'pain-discovery' || !Array.isArray(report.observations) ||
      !Array.isArray(report.claims) || !report.summary || !report.dates) fail('ожидался Evidence Report v1');
  safeText(report.topic, 160);
  if (report.observations.length > MAX_OBSERVATIONS || report.claims.length > MAX_CLAIMS) fail('превышен предел размера выборки');

  const rows = new Map(), accepted = [];
  for (const row of report.observations) {
    if (!row || typeof row.id !== 'string' || !/^pain:[a-f0-9]{20}$/.test(row.id) || rows.has(row.id)) {
      fail('повторяющийся/некорректный ID наблюдения');
    }
    if (row.kind !== 'wordstat_phrase' && row.kind !== 'serp_snippet') fail('неизвестный тип источника');
    safeText(row.query, 1000);
    safeText(row.excerpt, 12000);
    if (row.title !== undefined) safeText(row.title, 2000);
    if (typeof row.accepted !== 'boolean' || typeof row.needsReview !== 'boolean') fail('неполная классификация наблюдения');
    if (!optionalCount(row.observedCount ?? null)) fail('некорректная частотность');
    if (row.kind === 'serp_snippet') safeUrl(row.url);
    else if (row.url != null) fail('поисковая фраза не имеет URL');
    if (row.accepted) {
      if (!Object.hasOwn(PAIN_CATEGORIES, row.category) || row.category === 'none') fail('неизвестная категория принятого свидетельства');
      accepted.push(row);
    }
    rows.set(row.id, row);
  }
  const summary = report.summary;
  if (![summary.assessedObservations, summary.modelAccepted, summary.modelRejected,
    summary.hypothesisCategories, summary.modelReviewNeeded].every(int) ||
    summary.assessedObservations !== rows.size ||
    summary.modelAccepted !== accepted.length ||
    summary.modelRejected !== rows.size - accepted.length ||
    summary.hypothesisCategories !== report.claims.length ||
    summary.modelReviewNeeded !== accepted.filter(row => row.needsReview).length) {
    fail('счётчики отчёта не соответствуют наблюдениям');
  }
  if (report.quality !== null && report.quality !== undefined &&
    !['insufficient_manual_labels','provisional_human_benchmark'].includes(report.quality.status)) {
    fail('неизвестный статус ручной проверки');
  }
  const used = new Set(), claimIds = new Set();
  const claims = report.claims.map(claim => {
    if (!claim || !Object.hasOwn(PAIN_CATEGORIES, claim.id) || claim.id === 'none' ||
        claimIds.has(claim.id) || claim.status !== 'hypothesis_requires_validation' ||
        !Array.isArray(claim.evidenceIds) || !claim.evidenceIds.length) fail('некорректная категория гипотез');
    claimIds.add(claim.id);
    if (![claim.acceptedObservations, claim.observedWordstatPhrases, claim.observedSerpSnippets,
      claim.distinctSerpPages, claim.needsHumanReview].every(int)) fail('некорректные счётчики категории');
    if (!optionalCount(claim.largestSinglePhraseCount ?? null)) fail('некорректная частотность категории');
    const group = [];
    for (const evidenceId of claim.evidenceIds) {
      const row = rows.get(evidenceId);
      if (!row || !row.accepted || row.category !== claim.id || used.has(evidenceId)) {
        fail('ссылка гипотезы на неподходящее свидетельство');
      }
      used.add(evidenceId);
      group.push(row);
    }
    const phrases = group.filter(row => row.kind === 'wordstat_phrase');
    const snippets = group.filter(row => row.kind === 'serp_snippet');
    const validCounts = phrases.map(row => row.observedCount).filter(n => n != null);
    const maximum = validCounts.length ? Math.max(...validCounts) : null;
    if (claim.acceptedObservations !== group.length ||
        claim.observedWordstatPhrases !== phrases.length ||
        claim.observedSerpSnippets !== snippets.length ||
        claim.distinctSerpPages !== new Set(snippets.map(row => row.url)).size ||
        claim.needsHumanReview !== group.filter(row => row.needsReview).length ||
        (claim.largestSinglePhraseCount ?? null) !== maximum) fail('метрики категории не сходятся с источниками');
    return {
      id: claim.id, title: PAIN_CATEGORIES[claim.id], status: claim.status,
      observedWordstatPhrases: phrases.length, observedSerpSnippets: snippets.length,
      distinctSerpPages: claim.distinctSerpPages, acceptedObservations: group.length,
      needsHumanReview: claim.needsHumanReview, largestSinglePhraseCount: maximum,
    };
  });
  if (used.size !== accepted.length) fail('не все принятые свидетельства связаны с категориями');

  return {
    topic: report.topic,
    analyzedAt: typeof report.dates.analysisAt === 'string' ? report.dates.analysisAt : null,
    qualityStatus: report.quality?.status ?? 'not_provided',
    summary: {
      assessedObservations: rows.size, modelAccepted: accepted.length,
      modelRejected: summary.modelRejected, hypothesisCategories: claims.length,
      modelReviewNeeded: summary.modelReviewNeeded,
    },
    claims,
    // Only source-grounded accepted observations; other evaluated rows remain in the original JSON.
    evidence: accepted.map(row => ({
      id: row.id, category: row.category, kind: row.kind,
      query: row.query, title: row.title || row.query,
      excerpt: row.excerpt, url: row.kind === 'serp_snippet' ? safeUrl(row.url) : null,
      observedCount: row.observedCount ?? null,
      needsReview: row.needsReview,
      region: typeof row.region === 'string' ? row.region.slice(0,160) : null,
      sourceGeneratedAt: typeof row.sourceGeneratedAt === 'string' ? row.sourceGeneratedAt : null,
    })),
  };
}

export async function studioPainReport({workspaceRoot, casesDir = path.join(workspaceRoot, 'cases'), caseId} = {}) {
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) fail('не задана рабочая папка', 400);
  let id;
  try { id = safeConfigId(caseId, 'case id'); } catch { fail('неверный идентификатор проекта', 400); }
  const root = path.resolve(workspaceRoot);
  await directory(root);
  await directory(casesDir);
  const sourceCasePath = path.join(casesDir, id + '.json');
  await regularFile(sourceCasePath);
  const sourceCase = JSON.parse(await fs.readFile(sourceCasePath, 'utf8'));
  if (sourceCase?.id !== id) fail('неверная конфигурация проекта');

  const outputRoot = path.join(root, 'results');
  const caseResults = path.join(outputRoot, id);
  const relativePath = 'results/' + id + '/pain-report.json';
  if (!await directory(outputRoot, true) || !await directory(caseResults, true)) {
    return {status:'no_report',caseId:id,expectedRelativePath:relativePath};
  }
  const file = path.join(caseResults, 'pain-report.json');
  if (!await regularFile(file, true)) return {status:'no_report',caseId:id,expectedRelativePath:relativePath};
  const raw = await fs.readFile(file, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) fail('слишком большой отчёт');
  const report = JSON.parse(raw);
  return {status:'ready',caseId:id,report:projectReport(report)};
}
