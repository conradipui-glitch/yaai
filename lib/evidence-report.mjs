import { PAIN_CATEGORIES } from './pain-discovery.mjs';
import { painMapFingerprint } from './pain-quality.mjs';

function requireTrue(condition, message) {
  if (!condition) throw new Error('Report integrity: ' + message);
}
function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
const KIND = new Set(['wordstat_phrase', 'serp_snippet']);
const knownCategories = new Set(Object.keys(PAIN_CATEGORIES).filter(x => x !== 'none'));

export function buildPainReportDocument(map, { quality = null } = {}) {
  requireTrue(map?.schemaVersion === 1 && map.source === 'yaai-pain-discovery',
    'expected Pain Discovery v1 map.');
  requireTrue(typeof map.topic === 'string' && map.topic.trim(), 'topic is missing.');
  requireTrue(Array.isArray(map.evidenceLedger) && Array.isArray(map.cards) &&
    map.summary && map.input, 'complete evidenceLedger, cards and summary are required.');
  const ids = new Set();
  const rows = map.evidenceLedger.map(item => {
    requireTrue(item && typeof item.id === 'string' && item.id && !ids.has(item.id),
      'every evidence row needs a unique ID.');
    ids.add(item.id);
    requireTrue(KIND.has(item.kind), 'unknown source kind in ' + item.id);
    requireTrue(typeof item.query === 'string' && item.query.trim(),
      'missing original query in ' + item.id);
    requireTrue(typeof item.excerpt === 'string' && item.excerpt.trim(),
      'missing original excerpt in ' + item.id);
    const cls = item.classification;
    requireTrue(cls && cls.evidenceId === item.id && typeof cls.accepted === 'boolean',
      'unmatched model decision for ' + item.id);
    const category = cls.category;
    requireTrue(category == null || Object.hasOwn(PAIN_CATEGORIES, category),
      'unknown model category in ' + item.id);
    requireTrue(!cls.accepted || knownCategories.has(category),
      'accepted observation has no valid pain category: ' + item.id);
    requireTrue(typeof cls.needsReview === 'boolean', 'missing review status in ' + item.id);
    const count = item.observedCount;
    requireTrue(count == null || numberOrNull(count) !== null,
      'invalid observed Wordstat count in ' + item.id);
    requireTrue(item.kind !== 'wordstat_phrase' || item.url == null,
      'Wordstat observation must not claim a source URL: ' + item.id);
    requireTrue(item.kind !== 'serp_snippet' ||
      (typeof item.url === 'string' && /^https?:\/\/\S+$/i.test(item.url)),
      'SERP source URL is not valid in ' + item.id);
    return {
      id: item.id, kind: item.kind,
      query: item.query, title: item.title || item.query,
      excerpt: item.excerpt, url: item.url || null,
      region: item.region ?? null, sourceGeneratedAt: item.sourceGeneratedAt ?? null,
      observedCount: numberOrNull(count), accepted: cls.accepted,
      modelCategory: category ?? null,
      category: cls.accepted ? category : null,
      needsReview: cls.needsReview,
      voice: cls.voice ?? null,
      painProbability: numberOrNull(cls.painProbability),
      modelCostUsd: numberOrNull(cls.modelCostUsd),
    };
  });
  requireTrue(rows.length === map.input.evidenceItemCount &&
    rows.length === map.input.classifiedCount,
  'ledger size differs from assessed input.');
  const accepted = rows.filter(x => x.accepted);
  const uncertain = accepted.filter(x => x.needsReview).length;
  requireTrue(map.summary.acceptedEvidence === accepted.length &&
    map.summary.rejectedEvidence === rows.length - accepted.length &&
    map.summary.uncertainEvidence === uncertain,
  'report summary disagrees with the full evidence ledger.');
  const groups = new Map();
  for (const row of accepted) {
    const group = groups.get(row.category) || [];
    group.push(row);
    groups.set(row.category, group);
  }
  requireTrue(map.cards.length === groups.size &&
    map.summary.painCategories === groups.size, 'categories disagree with the ledger.');
  const claims = [];
  const seenCategories = new Set();
  for (const card of map.cards) {
    requireTrue(card && knownCategories.has(card.category) && !seenCategories.has(card.category),
      'duplicate/unknown pain card category.');
    seenCategories.add(card.category);
    requireTrue(card.status === 'hypothesis_requires_validation',
      'pain cards must remain unverified hypotheses.');
    const examples = groups.get(card.category);
    requireTrue(Array.isArray(examples) && examples.length > 0,
      'pain card has no accepted source observations.');
    const wordstat = examples.filter(x=>x.kind==='wordstat_phrase');
    const serp = examples.filter(x=>x.kind==='serp_snippet');
    const distinctPages = new Set(serp.map(x=>x.url)).size;
    const counts = wordstat.map(x=>x.observedCount).filter(x=>x!==null);
    const bestCount = counts.length ? Math.max(...counts) : null;
    requireTrue(card.searchPhraseCount === wordstat.length &&
      card.snippetCount === serp.length &&
      card.distinctSearchPages === distinctPages &&
      card.needsReviewCount === examples.filter(x=>x.needsReview).length &&
      card.bestObservedWordstatCount === bestCount,
    'pain card counts do not match the ledger: ' + card.category);
    const idsInGroup = new Set(examples.map(x=>x.id));
    for (const kind of ['wordstat','serp']) {
      requireTrue(Array.isArray(card.evidence?.[kind]), 'missing card source sample.');
      for (const example of card.evidence[kind]) {
        requireTrue(idsInGroup.has(example.id),
          'card cites observation outside its category: ' + card.category);
      }
    }
    claims.push({
      id: card.category, title: PAIN_CATEGORIES[card.category],
      statement: 'В изученных источниках обнаружены возможные признаки: ' + PAIN_CATEGORIES[card.category].toLowerCase(),
      status: 'hypothesis_requires_validation',
      evidenceIds: examples.map(x=>x.id),
      acceptedObservations: examples.length,
      observedWordstatPhrases: wordstat.length,
      observedSerpSnippets: serp.length, distinctSerpPages: distinctPages,
      largestSinglePhraseCount: bestCount,
      needsHumanReview: examples.filter(x=>x.needsReview).length,
      examples: examples.slice(0, 4).map(x=>x.id),
      limitation: 'Это группировка решений Jev, а не подтверждённая боль покупателей или размер рынка.',
      nextAction: 'Открыть исходные фрагменты, проверить контекст и провести независимую ручную разметку.',
    });
  }

  let humanQuality = null;
  if (quality !== null) {
    requireTrue(quality?.schemaVersion === 1 &&
      quality.source === 'yaai-pain-quality-report' &&
      quality.topic === map.topic &&
      quality.mapFingerprint === painMapFingerprint(map),
    'human-quality report belongs to another map or is invalid.');
    requireTrue(['insufficient_manual_labels','provisional_human_benchmark'].includes(quality.status) &&
      quality.sample && quality.metrics,
    'unknown human-quality status.');
    requireTrue(quality.sample.population === rows.length,
      'human review population does not match this evidence ledger.');
    humanQuality = {
      status: quality.status, sample: {
        labeled: quality.sample.labeled, queued: quality.sample.queued,
        target: quality.sample.target,
        method: quality.sample.method,
      },
      // Only show human benchmark numbers when there are sufficient labels.
      metrics: quality.status === 'provisional_human_benchmark'
        ? {
          precision: quality.metrics.painPrecision,
          recall: quality.metrics.painRecall,
          sourceSupportedCoverage: quality.metrics.validatedEvidenceCoverage,
        } : null,
      note: quality.status === 'provisional_human_benchmark'
        ? 'Предварительные метрики только для вручную размеченной выборки; метки не проверялись независимо.'
        : 'Пока недостаточно ручных меток для оценки качества модели.',
    };
  }

  return {
    schemaVersion: 1, source: 'yaai-evidence-report',
    reportType: 'pain-discovery', title: 'Карта потенциальных проблем аудитории',
    topic: map.topic,
    dates: {
      analysisAt: map.generatedAt || null,
      wordstatAt: map.input.wordstatGeneratedAt ?? null,
      serpAt: map.input.serpGeneratedAt ?? null,
    },
    summary: {
      assessedObservations: rows.length, modelAccepted: accepted.length,
      modelRejected: rows.length - accepted.length,
      hypothesisCategories: claims.length,
      modelReviewNeeded: uncertain,
      sourceBreakdown: {
        wordstat: rows.filter(x=>x.kind==='wordstat_phrase').length,
        serp: rows.filter(x=>x.kind==='serp_snippet').length,
      },
      jevCostUsd: numberOrNull(map.summary.measuredModelCostUsd),
      measuredJevCostSubtotalUsd: numberOrNull(map.summary.measuredModelCostSubtotalUsd),
      missingJevCostCount: numberOrNull(map.summary.missingModelCostCount),
    },
    quality: humanQuality,
    claims, observations: rows,
    provenance: {
      traceability: 'Each hypothesis points to evidence IDs in observations; model negatives are preserved.',
      sourceLimitations: [
        'Wordstat: запросы, а не уникальные люди, покупки или жалобы; частотности пересекаются и не суммируются.',
        'SERP: только заголовки и фрагменты поисковой выдачи, без проверки полного текста страниц.',
        'Вероятность модели не является калиброванной оценкой достоверности.',
        'Без человеческой разметки Pain Quality нельзя утверждать качество или точность выводов.',
      ],
    },
  };
}
