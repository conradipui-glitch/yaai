const WORD_RE = /[\p{L}\p{N}]+/gu;

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

function classifyRow(row, preset, options) {
  const phrase = normalizeText(row.phrase);

  for (const negative of preset.negativeKeywords || []) {
    if (matchesKeyword(phrase, negative)) {
      return { status: 'negative', reason: negative };
    }
  }

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

    if (score > 0) {
      candidates.push({ intent, score, matchedKeywords });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.intent.id.localeCompare(b.intent.id));
  const best = candidates[0];
  if (!best) return { status: 'unassigned' };

  const types = new Set(row.types || []);
  const associationOnly = types.has('association') && !types.has('top');
  const threshold = associationOnly ? Number(options.associationMinScore || 4) : Number(options.topMinScore || 2);
  if (best.score < threshold) return { status: 'unassigned', score: best.score };

  return {
    status: 'assigned',
    intentId: best.intent.id,
    intentTitle: best.intent.title,
    cluster: best.intent.cluster,
    businessPriority: best.intent.priority || '',
    score: best.score,
    confidence: best.score >= 8 ? 'high' : best.score >= 4 ? 'medium' : 'low',
    matchedKeywords: best.matchedKeywords,
  };
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
  };

  const assignedRows = [];
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

    const classification = classifyRow(row, preset, options);
    if (classification.status === 'negative') {
      stats.negativeRows += 1;
      continue;
    }
    if (classification.status !== 'assigned') {
      stats.unassignedRows += 1;
      reviewRows.push({ ...row, analysisStatus: 'unassigned', bestScore: classification.score || 0 });
      continue;
    }

    stats.assignedRows += 1;
    const enriched = { ...row, ...classification };
    assignedRows.push(enriched);
    if (classification.confidence === 'low') reviewRows.push(enriched);

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
      confidenceCounts: { high: 0, medium: 0, low: 0 },
      phrases: [],
      relativeDemandBand: 'none',
      relativeRank: null,
    };

    entry.phraseCount += 1;
    entry.confidenceCounts[classification.confidence] += 1;
    entry.phrases.push({ phrase: row.phrase, count, confidence: classification.confidence, types: row.types || [], score: classification.score });
    if (count > entry.maxCount) {
      entry.maxCount = count;
      entry.strongestPhrase = row.phrase;
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
          confidenceCounts: { high: 0, medium: 0, low: 0 },
          phrases: [],
          relativeDemandBand: 'none',
          relativeRank: null,
        });
      }
    }
  }

  const summary = [...summaryMap.values()];
  for (const item of summary) {
    item.phrases.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, 'ru'));
    item.topPhrases = item.phrases.slice(0, 8);
    delete item.phrases;
  }
  relativeBands(summary);
  summary.sort((a, b) => {
    if (a.regionName !== b.regionName) return a.regionName.localeCompare(b.regionName, 'ru');
    if (a.relativeRank == null && b.relativeRank != null) return 1;
    if (a.relativeRank != null && b.relativeRank == null) return -1;
    return (a.relativeRank || 9999) - (b.relativeRank || 9999) || a.intentId.localeCompare(b.intentId);
  });

  return {
    meta: {
      presetId: preset.id || null,
      presetName: preset.name || null,
      includeTop,
      includeAssociations,
      minCount,
      generatedAt: new Date().toISOString(),
      note: 'Классификация строится по фактической фразе, а не по seed. maxCount и relativeDemandBand — сигналы внутри текущей выборки, а не суммарный поисковый объём.',
      ...stats,
    },
    summary,
    assignedRows,
    reviewRows: reviewRows.slice(0, 1000),
  };
}
