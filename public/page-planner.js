const WORD_RE = /[\p{L}\p{N}]+/gu;

export function normalizePlannerText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[×xх]/g, 'х')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegex(keyword) {
  const normalized = normalizePlannerText(keyword);
  const parts = normalized.split(/\s+/).filter(Boolean);
  const source = parts.map((part) => {
    const wildcard = part.endsWith('*');
    const base = wildcard ? part.slice(0, -1) : part;
    const escaped = escapeRegex(base);
    return wildcard ? `${escaped}[\\p{L}\\p{N}-]*` : escaped;
  }).join('\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${source}(?:$|[^\\p{L}\\p{N}])`, 'iu');
}

function matches(text, keyword) {
  if (!text || !keyword) return false;
  return keywordRegex(keyword).test(normalizePlannerText(text));
}

function transliterate(value) {
  const map = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };
  return normalizePlannerText(value)
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 90) || 'topic';
}

function rowTypeAllowed(row, target) {
  if (!target.kind) return true;
  if (target.kind === 'landing') return row.nextAction === 'landing';
  if (target.kind === 'guide') return row.nextAction === 'guide';
  return true;
}

function targetScore(row, target) {
  if (!rowTypeAllowed(row, target)) return 0;
  let score = 0;
  if ((target.intentIds || []).includes(row.intentId)) score += 100;
  for (const keyword of target.keywords || []) {
    if (matches(row.phrase, keyword)) score += 40;
  }
  for (const seed of row.seeds || []) {
    if ((target.seeds || []).some((rule) => matches(seed, rule))) score += 25;
  }
  return score;
}

function decisionForTarget(target) {
  if (target.mode === 'section') return 'merge';
  if (target.status === 'existing') return 'expand';
  return 'create';
}

function makeGenericTarget(row, config = {}) {
  if (row.nextAction === 'guide' && row.intentId) {
    return {
      id: `generated-guide-${row.intentId}`,
      title: row.intentTitle || row.phrase,
      kind: 'guide',
      status: 'planned',
      mode: 'primary',
      path: String(config.genericGuidePath || '/guides/{slug}/').replaceAll('{slug}', transliterate(row.intentTitle || row.phrase)),
      priority: row.businessPriority || 'P3',
      focusWeight: 1,
      generated: true,
      note: 'Автоматический кандидат: intent есть, но в preset ещё нет явного page target.'
    };
  }
  if (row.nextAction === 'landing' && row.intentId) {
    return {
      id: `generated-landing-${row.intentId}`,
      title: row.intentTitle || row.phrase,
      kind: 'landing',
      status: 'planned',
      mode: 'primary',
      path: String(config.genericLandingPath || '/{slug}-omsk/').replaceAll('{slug}', transliterate(row.intentTitle || row.phrase)),
      priority: row.businessPriority || 'P3',
      focusWeight: 1,
      generated: true,
      note: 'Автоматический кандидат: коммерческий intent не привязан к существующей странице.'
    };
  }
  return null;
}

function priorityWeight(priority) {
  if (priority === 'P1') return 8;
  if (priority === 'P2') return 4;
  return 0;
}

function decisionWeight(decision) {
  if (decision === 'expand') return 8;
  if (decision === 'merge') return 6;
  if (decision === 'create') return 4;
  return 0;
}

function strongestPriority(rows, targetPriority) {
  const priorities = [targetPriority, ...rows.map((row) => row.businessPriority)].filter(Boolean);
  if (priorities.includes('P1')) return 'P1';
  if (priorities.includes('P2')) return 'P2';
  if (priorities.includes('P3')) return 'P3';
  return '';
}

function finalizeGroup(group, config) {
  const phraseKeys = new Set();
  const regions = new Map();
  const intents = new Set();
  const queryTypes = { commercial: 0, informational: 0, unmapped: 0, noise: 0 };
  let strongest = null;

  for (const row of group.rows) {
    phraseKeys.add(normalizePlannerText(row.phrase));
    if (row.intentId) intents.add(row.intentId);
    if (row.queryType in queryTypes) queryTypes[row.queryType] += 1;
    if (!strongest || Number(row.count || 0) > Number(strongest.count || 0)) strongest = row;

    const regionId = String(row.regionId || '');
    const region = regions.get(regionId) || {
      regionId,
      regionName: row.regionName || regionId,
      phraseCount: 0,
      maxCount: 0,
      strongestPhrase: '',
    };
    region.phraseCount += 1;
    if (Number(row.count || 0) > region.maxCount) {
      region.maxCount = Number(row.count || 0);
      region.strongestPhrase = row.phrase;
    }
    regions.set(regionId, region);
  }

  const maxCount = Number(strongest?.count || 0);
  const businessPriority = strongestPriority(group.rows, group.target.priority);
  const focusWeight = Number(group.target.focusWeight ?? config.defaultFocusWeight ?? 1);
  const score = Math.round((Math.log10(maxCount + 1) * 20 + focusWeight * 8 + decisionWeight(group.decision) + priorityWeight(businessPriority)) * 10) / 10;
  const topQueries = [...group.rows]
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.phrase).localeCompare(String(b.phrase), 'ru'))
    .slice(0, 10)
    .map((row) => ({
      phrase: row.phrase,
      count: Number(row.count || 0),
      regionName: row.regionName,
      queryType: row.queryType,
      intentId: row.intentId || '',
    }));

  return {
    planId: group.target.id,
    title: group.target.title,
    path: group.target.path,
    pageKind: group.target.kind || strongest?.nextAction || 'unknown',
    decision: group.decision,
    status: group.target.status || 'planned',
    mode: group.target.mode || 'primary',
    generated: Boolean(group.target.generated),
    businessPriority,
    focusWeight,
    plannerScore: score,
    phraseCount: phraseKeys.size,
    rowCount: group.rows.length,
    maxCount,
    strongestPhrase: strongest?.phrase || '',
    strongestRegion: strongest?.regionName || '',
    regions: [...regions.values()].sort((a, b) => b.maxCount - a.maxCount),
    intentIds: [...intents].sort(),
    queryTypeCounts: queryTypes,
    topQueries,
    note: group.target.note || '',
  };
}

export function buildPagePlan(analysis, preset, options = {}) {
  const config = preset?.pagePlanner || {};
  const targets = Array.isArray(config.targets) ? config.targets : [];
  const groups = new Map();
  const holdRows = [];
  const rows = Array.isArray(analysis?.classifiedRows) ? analysis.classifiedRows : [];
  const includeAssociations = options.includeAssociations === true;

  for (const row of rows) {
    const types = new Set(row.types || []);
    if (!includeAssociations && !types.has('top')) continue;
    if (row.queryType === 'noise' || row.nextAction === 'hold') {
      holdRows.push({ ...row, plannerReason: row.queryType === 'noise' ? 'noise' : 'hold-by-query-classifier' });
      continue;
    }

    const candidates = targets
      .map((target) => ({ target, score: targetScore(row, target) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.target.id).localeCompare(String(b.target.id)));

    let target = candidates[0]?.target || null;
    if (!target) target = makeGenericTarget(row, config);

    if (!target) {
      holdRows.push({ ...row, plannerReason: row.queryType === 'commercial' ? 'commercial-unmapped-needs-target' : 'no-page-target' });
      continue;
    }

    const decision = decisionForTarget(target);
    const key = String(target.id);
    const group = groups.get(key) || { target, decision, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const pages = [...groups.values()].map((group) => finalizeGroup(group, config));
  pages.sort((a, b) => b.plannerScore - a.plannerScore || b.maxCount - a.maxCount || a.title.localeCompare(b.title, 'ru'));

  const nowCount = Math.max(1, Number(config.nowCount || 5));
  const nextCount = Math.max(nowCount, Number(config.nextCount || 10));
  pages.forEach((page, index) => {
    page.priorityRank = index + 1;
    page.priorityBand = index < nowCount ? 'now' : index < nextCount ? 'next' : 'later';
  });

  const decisionCounts = { expand: 0, create: 0, merge: 0, hold: holdRows.length };
  for (const page of pages) decisionCounts[page.decision] = (decisionCounts[page.decision] || 0) + 1;

  holdRows.sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.phrase || '').localeCompare(String(b.phrase || ''), 'ru'));

  return {
    meta: {
      presetId: preset?.id || null,
      generatedAt: new Date().toISOString(),
      inputClassifiedRows: rows.length,
      pageCandidates: pages.length,
      decisionCounts,
      nowCount: Math.min(nowCount, pages.length),
      nextCount: Math.min(nextCount, pages.length),
      note: 'Page Planner группирует запросы в страницы и не суммирует Wordstat count. Приоритет — рабочая эвристика по strongest query, бизнес-приоритету, фокусу проекта и трудоёмкости действия.'
    },
    pages,
    holdRows: holdRows.slice(0, 1000),
  };
}
