const WORD_RE = /[\p{L}\p{N}]+/gu;
const QUERY_TYPES = ['commercial', 'informational', 'unmapped', 'noise'];
const NEXT_ACTIONS = ['landing', 'guide', 'hold'];

export function normalizeText(value) {
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
  const normalized = normalizeText(keyword);
  const parts = normalized.split(/\s+/).filter(Boolean);
  const source = parts.map((part) => {
    const wildcard = part.endsWith('*');
    const base = wildcard ? part.slice(0, -1) : part;
    const escaped = escapeRegex(base);
    return wildcard ? `${escaped}[\\p{L}\\p{N}-]*` : escaped;
  }).join('\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${source}(?:$|[^\\p{L}\\p{N}])`, 'iu');
}

function matchesKeyword(text, keyword) {
  if (!keyword) return false;
  return keywordRegex(keyword).test(normalizeText(text));
}

function keywordWeight(keyword) {
  const normalized = normalizeText(keyword);
  const words = normalized.match(WORD_RE) || [];
  if (words.length >= 3) return 6;
  if (words.length === 2) return 4;
  return normalized.endsWith('*') ? 2 : 3;
}

function scoreKeywords(text, keywords) {
  let score = 0;
  const matched = [];
  for (const keyword of keywords || []) {
    if (!matchesKeyword(text, keyword)) continue;
    score += keywordWeight(keyword);
    matched.push(keyword);
  }
  return { score, matched };
}

function findNegativeKeyword(phrase, preset) {
  for (const negative of preset.negativeKeywords || []) {
    if (matchesKeyword(phrase, negative)) return negative;
  }
  return null;
}

function classifyIntent(phrase, preset, options) {
  const candidates = [];
  for (const intent of preset.intents || []) {
    let score = 0;
    const matchedKeywords = [];
    for (const keyword of intent.keywords || []) {
      if (matchesKeyword(phrase, keyword)) {
        score += keywordWeight(keyword);
        matchedKeywords.push(keyword);
      }
    }
    if (score > 0) candidates.push({ intent, score, matchedKeywords });
  }

  candidates.sort((a, b) => b.score - a.score || a.intent.id.localeCompare(b.intent.id));
  const best = candidates[0];
  if (!best) return { status: 'unassigned' };

  const types = new Set(options.rowTypes || []);
  const associationOnly = types.has('association') && !types.has('top');
  const threshold = associationOnly ? Number(options.associationMinScore || 4) : Number(options.topMinScore || 2);
  if (best.score < threshold) return { status: 'unassigned', score: best.score };

  return {
    status: 'assigned',
    intent: best.intent,
    intentId: best.intent.id,
    intentTitle: best.intent.title,
    cluster: best.intent.cluster,
    businessPriority: best.intent.priority || '',
    score: best.score,
    confidence: best.score >= 8 ? 'high' : best.score >= 4 ? 'medium' : 'low',
    matchedKeywords: best.matchedKeywords,
  };
}

function classifyQueryType(phrase, preset, intent = null) {
  const rules = preset.queryClassification || {};
  const commercial = scoreKeywords(phrase, rules.commercialKeywords || []);
  const informational = scoreKeywords(phrase, rules.informationalKeywords || []);
  const words = normalizeText(phrase).match(WORD_RE) || [];
  const headMaxWords = Math.max(1, Number(rules.commercialHeadMaxWords || 4));
  const head = words.length <= headMaxWords
    ? scoreKeywords(phrase, rules.commercialHeadKeywords || [])
    : { score: 0, matched: [] };

  let commercialScore = commercial.score;
  const informationalScore = informational.score;
  if (head.matched.length) commercialScore += 3;

  let queryType = 'unmapped';
  let querySource = 'none';
  let queryConfidence = 'none';

  if (commercialScore > informationalScore && commercialScore > 0) {
    queryType = 'commercial';
    querySource = commercial.score > 0 ? 'signals' : 'commercial-head';
    queryConfidence = querySource === 'commercial-head'
      ? 'medium'
      : commercialScore - informationalScore >= 3 ? 'high' : 'medium';
  } else if (informationalScore > commercialScore && informationalScore > 0) {
    queryType = 'informational';
    querySource = 'signals';
    queryConfidence = informationalScore - commercialScore >= 3 ? 'high' : 'medium';
  } else if (commercialScore > 0 && informationalScore > 0) {
    const fallback = intent?.queryType;
    if (fallback === 'commercial' || fallback === 'informational') {
      queryType = fallback;
      querySource = 'intent-tiebreak';
      queryConfidence = 'medium';
    } else {
      queryType = 'commercial';
      querySource = 'signals-tie';
      queryConfidence = 'low';
    }
  } else if (intent?.queryType === 'commercial' || intent?.queryType === 'informational') {
    queryType = intent.queryType;
    querySource = 'intent-default';
    queryConfidence = 'low';
  }

  return {
    queryType,
    querySource,
    queryConfidence,
    queryScores: { commercial: commercialScore, informational: informationalScore },
    querySignals: {
      commercial: commercial.matched,
      informational: informational.matched,
      commercialHead: head.matched,
    },
  };
}

function nextActionFor(queryType) {
  if (queryType === 'commercial') return 'landing';
  if (queryType === 'informational') return 'guide';
  return 'hold';
}

function relativeBands(summary) {
  const byRegion = new Map();
  for (const item of summary) {
    if (!byRegion.has(item.regionId)) byRegion.set(item.regionId, []);
    if (item.phraseCount > 0) byRegion.get(item.regionId).push(item);
  }

  for (const items of byRegion.values()) {
    items.sort((a, b) => b.maxCount - a.maxCount || b.phraseCount - a.phraseCount);
    const n = items.length;
    items.forEach((item, index) => {
      const position = n <= 1 ? 0 : index / (n - 1);
      item.relativeDemandBand = position <= 0.25 ? 'high' : position <= 0.7 ? 'medium' : 'low';
      item.relativeRank = index + 1;
    });
  }
}

function dominantQueryType(item) {
  const candidates = ['commercial', 'informational', 'unmapped']
    .map((type) => ({ type, count: Number(item.queryTypeCounts?.[type] || 0) }))
    .sort((a, b) => b.count - a.count);
  if (!candidates[0] || candidates[0].count === 0) return 'unmapped';
  if (candidates[1] && candidates[0].count === candidates[1].count && item.strongestQueryType) {
    return item.strongestQueryType;
  }
  return candidates[0].type;
}

export function analyzeRows(rows, preset, options = {}) {
  const includeTop = options.includeTop !== false;
  const includeAssociations = options.includeAssociations === true;
  const minCount = Math.max(0, Number(options.minCount || 0));

  const stats = {
    inputRows: Array.isArray(rows) ? rows.length : 0,
    eligibleRows: 0,
    assignedRows: 0,
    unassignedRows: 0,
    negativeRows: 0,
    filteredByType: 0,
    filteredByCount: 0,
    queryTypeCounts: Object.fromEntries(QUERY_TYPES.map((type) => [type, 0])),
    nextActionCounts: Object.fromEntries(NEXT_ACTIONS.map((action) => [action, 0])),
  };

  const assignedRows = [];
  const classifiedRows = [];
  const reviewRows = [];
  const summaryMap = new Map();

  for (const row of rows || []) {
    const types = new Set(row.types || []);
    const hasTop = types.has('top');
    const hasAssociation = types.has('association');
    const eligibleType = (includeTop && hasTop) || (includeAssociations && hasAssociation);
    if (!eligibleType) {
      stats.filteredByType += 1;
      continue;
    }

    const count = Number(row.count || 0);
    if (count < minCount) {
      stats.filteredByCount += 1;
      continue;
    }
    stats.eligibleRows += 1;

    const phrase = normalizeText(row.phrase);
    const negative = findNegativeKeyword(phrase, preset);
    if (negative) {
      stats.negativeRows += 1;
      stats.queryTypeCounts.noise += 1;
      stats.nextActionCounts.hold += 1;
      classifiedRows.push({
        ...row,
        analysisStatus: 'negative',
        negativeReason: negative,
        queryType: 'noise',
        querySource: 'negative-rule',
        queryConfidence: 'high',
        queryScores: { commercial: 0, informational: 0 },
        querySignals: { commercial: [], informational: [], commercialHead: [] },
        nextAction: 'hold',
      });
      continue;
    }

    const intentMatch = classifyIntent(phrase, preset, { ...options, rowTypes: row.types || [] });
    const query = classifyQueryType(phrase, preset, intentMatch.status === 'assigned' ? intentMatch.intent : null);
    const nextAction = nextActionFor(query.queryType);
    stats.queryTypeCounts[query.queryType] += 1;
    stats.nextActionCounts[nextAction] += 1;

    if (intentMatch.status !== 'assigned') {
      stats.unassignedRows += 1;
      const enriched = {
        ...row,
        analysisStatus: 'unassigned',
        bestScore: intentMatch.score || 0,
        ...query,
        nextAction,
      };
      classifiedRows.push(enriched);
      reviewRows.push(enriched);
      continue;
    }

    stats.assignedRows += 1;
    const { intent, ...classification } = intentMatch;
    const enriched = {
      ...row,
      ...classification,
      ...query,
      nextAction,
      analysisStatus: 'assigned',
    };
    assignedRows.push(enriched);
    classifiedRows.push(enriched);
    if (classification.confidence === 'low' || query.queryConfidence === 'low') reviewRows.push(enriched);

    const key = `${classification.intentId}|${row.regionId}`;
    const entry = summaryMap.get(key) || {
      intentId: classification.intentId,
      intentTitle: classification.intentTitle,
      cluster: classification.cluster,
      businessPriority: classification.businessPriority,
      regionId: String(row.regionId || ''),
      regionName: row.regionName || String(row.regionId || ''),
      phraseCount: 0,
      maxCount: 0,
      strongestPhrase: '',
      strongestQueryType: '',
      confidenceCounts: { high: 0, medium: 0, low: 0 },
      queryTypeCounts: { commercial: 0, informational: 0, unmapped: 0 },
      phrases: [],
      relativeDemandBand: 'none',
      relativeRank: null,
      dominantQueryType: 'unmapped',
      nextAction: 'hold',
    };

    entry.phraseCount += 1;
    entry.confidenceCounts[classification.confidence] += 1;
    if (query.queryType in entry.queryTypeCounts) entry.queryTypeCounts[query.queryType] += 1;
    entry.phrases.push({
      phrase: row.phrase,
      count,
      confidence: classification.confidence,
      types: row.types || [],
      score: classification.score,
      queryType: query.queryType,
      nextAction,
    });
    if (count > entry.maxCount) {
      entry.maxCount = count;
      entry.strongestPhrase = row.phrase;
      entry.strongestQueryType = query.queryType;
    }
    summaryMap.set(key, entry);
  }

  const regions = new Map();
  for (const row of rows || []) {
    if (row.regionId != null) regions.set(String(row.regionId), row.regionName || String(row.regionId));
  }

  for (const intent of preset.intents || []) {
    for (const [regionId, regionName] of regions) {
      const key = `${intent.id}|${regionId}`;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          intentId: intent.id,
          intentTitle: intent.title,
          cluster: intent.cluster,
          businessPriority: intent.priority || '',
          regionId,
          regionName,
          phraseCount: 0,
          maxCount: 0,
          strongestPhrase: '',
          strongestQueryType: '',
          confidenceCounts: { high: 0, medium: 0, low: 0 },
          queryTypeCounts: { commercial: 0, informational: 0, unmapped: 0 },
          phrases: [],
          relativeDemandBand: 'none',
          relativeRank: null,
          dominantQueryType: 'unmapped',
          nextAction: 'hold',
        });
      }
    }
  }

  const summary = [...summaryMap.values()];
  for (const item of summary) {
    item.phrases.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, 'ru'));
    item.topPhrases = item.phrases.slice(0, 8);
    delete item.phrases;
    item.dominantQueryType = dominantQueryType(item);
    item.nextAction = nextActionFor(item.dominantQueryType);
  }
  relativeBands(summary);
  summary.sort((a, b) => {
    if (a.regionName !== b.regionName) return a.regionName.localeCompare(b.regionName, 'ru');
    if (a.relativeRank == null && b.relativeRank != null) return 1;
    if (a.relativeRank != null && b.relativeRank == null) return -1;
    return (a.relativeRank || 9999) - (b.relativeRank || 9999) || a.intentId.localeCompare(b.intentId);
  });

  classifiedRows.sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.phrase || '').localeCompare(String(b.phrase || ''), 'ru'));

  return {
    meta: {
      presetId: preset.id || null,
      presetName: preset.name || null,
      includeTop,
      includeAssociations,
      minCount,
      generatedAt: new Date().toISOString(),
      note: 'Query type и nextAction — рабочая классификация для контентной архитектуры. maxCount и relativeDemandBand — сигналы внутри текущей выборки; частотности связанных запросов не суммируются в рынок.',
      ...stats,
    },
    summary,
    assignedRows,
    classifiedRows,
    reviewRows: reviewRows.slice(0, 1000),
  };
}
