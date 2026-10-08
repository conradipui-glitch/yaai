import crypto from 'node:crypto';

export const PAIN_CATEGORIES = {
  time_loss: 'Задержки и потеря времени',
  lost_opportunities: 'Потерянные заявки и возможности',
  high_cost: 'Высокая стоимость и перерасход',
  poor_quality: 'Ошибки и качество',
  unreliable: 'Сбои и ненадёжность',
  complexity: 'Сложность и ручная работа',
  uncertainty: 'Недоверие и неопределённость',
  alternatives: 'Поиск альтернатив',
  other: 'Другие проблемы',
  none: 'Проблема не выявлена',
};

// Search needs like price estimates or construction defects are candidate signals, NOT firsthand customer complaints.
const problemWords = /проблем|не работает|ошиб|срыв|сбо[ий]|теря|потер|дорог|сложн|долго|медлен|недостат|жалоб|почему|как исправ|как не |не могу|не уда|не устра|без результат|не хватает|отказ|плохо|альтернатив|цена|стоим|смет|трещ|протеч|течет|течёт|дефект|передел|плесен/i;
function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function count(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function hash(key) { return crypto.createHash('sha256').update(key).digest('hex').slice(0, 20); }
export function validateWordstatEvidence(data) {
  if (data == null) return null;
  if (!Array.isArray(data.rows)) throw new Error('Expected rows array from existing Wordstat batch evidence.');
  return data;
}

export function makePainQueryPlan({ topic, wordstat = null, maxQueries = 10 } = {}) {
  const term = clean(topic);
  if (term.length < 3 || term.length > 160) throw new Error('Topic must be 3–160 characters.');
  validateWordstatEvidence(wordstat);
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 30) throw new Error('maxQueries must be 1–30.');
  const observed = (wordstat?.rows || [])
    .filter(r => clean(r.phrase) && problemWords.test(clean(r.phrase)))
    .map(r => ({ query: clean(r.phrase), kind: 'observed-wordstat-phrase', count: count(r.count), region: r.regionName || null }))
    .sort((a,b) => (b.count ?? -1) - (a.count ?? -1));
  const generated = [
    term + ' проблемы', term + ' не работает', term + ' дорого',
    term + ' недостатки отзывы', 'почему ' + term + ' не получается',
    'альтернатива ' + term,
  ].map(query => ({ query, kind: 'generated-search-hypothesis', count: null, region: null }));
  const queries = [];
  const used = new Set();
  const n = Math.floor(maxQueries / 2);
  for (const candidate of [...observed.slice(0,n), ...generated, ...observed.slice(n)]) {
    const key = candidate.query.toLocaleLowerCase('ru');
    if (!used.has(key) && queries.length < maxQueries) {
      queries.push(candidate);
      used.add(key);
    }
  }
  return {
    schemaVersion: 1, source: 'yaai-pain-query-plan', topic: term,
    generatedAt: new Date().toISOString(), queries,
    wordstatProvided: Boolean(wordstat), observedPhraseCount: observed.length,
    note: 'Generated search queries are hypotheses, not measured demand. Cost-related search phrases are information needs, not proven complaints. Wordstat counts overlap.',
  };
}

export function buildPainEvidenceItems({ topic, wordstat = null, serp = null, limit = 100 } = {}) {
  const term = clean(topic);
  if (term.length < 3) throw new Error('Topic required.');
  validateWordstatEvidence(wordstat);
  if (serp && !Array.isArray(serp.queries)) throw new Error('SERP evidence needs queries array.');
  if (!wordstat && !serp) throw new Error('Need Wordstat or SERP evidence.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('limit must be 1–500.');

  const items = [], seen = new Set();
  for (const row of wordstat?.rows || []) {
    const phrase = clean(row.phrase);
    if (!phrase || !problemWords.test(phrase)) continue;
    const region = clean(row.regionName) || null;
    const key = 'wordstat|' + (region || '') + '|' + phrase.toLocaleLowerCase('ru');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: 'pain:' + hash(key), kind: 'wordstat_phrase', source: 'yandex-wordstat',
      sourceGeneratedAt: wordstat.generatedAt || null, query: phrase,
      title: phrase, excerpt: phrase, url: null, position: null, region,
      observedCount: count(row.count), observedType: Array.isArray(row.types) ? row.types : [],
      note: 'Search phrase is only an observed information need: price, estimate or defect words do not prove pain, complaint, purchase intent or an individual buyer.',
    });
  }
  for (const queryRecord of serp?.queries || []) {
    const query = clean(queryRecord.query);
    if (!query) continue;
    for (const result of queryRecord.results || []) {
      const url = clean(result.url), title = clean(result.title).slice(0, 400);
      const passage = clean(result.passage).slice(0, 1500);
      if (!/^https?:\/\/\S+$/i.test(url) || !(title || passage)) continue;
      const key = 'serp|' + url + '|' + passage;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: 'pain:' + hash(key), kind: 'serp_snippet', source: 'yandex-search-api-v2',
        sourceGeneratedAt: serp.generatedAt || null, query, title,
        excerpt: passage || title, url,
        position: Number(result.position) > 0 ? Number(result.position) : null,
        region: serp.region || null, observedCount: null, observedType: [],
        note: 'SERP snippet only; webpage and author identity not verified.',
      });
    }
  }
  const phrases = items.filter(r=>r.kind === 'wordstat_phrase')
    .sort((a,b)=>(b.observedCount ?? -1)-(a.observedCount ?? -1));
  const snippets = items.filter(r=>r.kind === 'serp_snippet');
  let ordered;
  if (phrases.length && snippets.length && limit < phrases.length + snippets.length) {
    // Never let a short Wordstat list exhaust the paid Jev budget before SERP gets examined.
    if (limit === 1) ordered = snippets.slice(0, 1);
    else {
      const phraseSlots = Math.min(phrases.length, Math.max(1, Math.floor(limit / 2)));
      const snippetSlots = Math.min(snippets.length, Math.max(1, limit - phraseSlots));
      ordered = [...phrases.slice(0, phraseSlots), ...snippets.slice(0, snippetSlots)];
      const present = new Set(ordered.map(row => row.id));
      for (const row of [...snippets, ...phrases]) {
        if (ordered.length >= limit) break;
        if (!present.has(row.id)) { ordered.push(row); present.add(row.id); }
      }
    }
  } else ordered = [...phrases, ...snippets].slice(0, limit);
  return ordered.map(evidence => ({
    id: evidence.id, evidence,
    state: {
      topic: term, sourceType: evidence.kind, query: evidence.query,
      title: evidence.title, excerpt: evidence.excerpt,
      caution: evidence.note,
    },
    meta: { kind: evidence.kind, url: evidence.url, region: evidence.region },
  }));
}

export function buildPainMap({ topic, evidenceItems, evaluations, wordstat = null, serp = null } = {}) {
  if (!Array.isArray(evidenceItems) || !Array.isArray(evaluations?.evaluations)) throw new Error('Evidence and evaluations required.');
  const sources = new Map(evidenceItems.map(item=>[item.id,item.evidence]));
  const groups = new Map();
  const classifications = [];
  for (const row of evaluations.evaluations) {
    const evidence = sources.get(row.itemId);
    if (!evidence) throw new Error('Jev decision references unknown evidence ID.');
    const present = row.answers?.pain_present?.value;
    const category = row.answers?.pain_type?.value;
    const voice = row.answers?.voice?.value;
    const accepted = typeof present === 'number' && present >= 0.65 && category && category !== 'none' && Object.hasOwn(PAIN_CATEGORIES,category);
    const cls = {
      evidenceId: evidence.id, category: category || null, painProbability: present ?? null,
      categoryCertainty: row.answers?.pain_type?.certainty ?? null,
      voice: voice || null, solutionIntentProbability: row.answers?.solution_intent?.value ?? null,
      needsReview: row.route?.needsReview ?? true, accepted: Boolean(accepted),
      modelCostUsd: Number.isFinite(Number(row.usage?.cost)) ? Number(row.usage.cost) : null,
    };
    classifications.push(cls);
    if (!accepted) continue;
    const group = groups.get(category) || { wordstat: [], serp: [], review: 0, firsthandCandidates: 0 };
    group[evidence.kind === 'wordstat_phrase' ? 'wordstat' : 'serp'].push({ ...evidence, classification: cls });
    if (cls.needsReview) group.review++;
    if (evidence.kind === 'serp_snippet' && voice === 'first_person' && !cls.needsReview) group.firsthandCandidates++;
    groups.set(category,group);
  }

  const cards = [...groups.entries()].map(([category,group]) => {
    const knownCounts = group.wordstat.map(p=>p.observedCount).filter(v=>v!==null);
    return {
      category, title: PAIN_CATEGORIES[category], status: 'hypothesis_requires_validation',
      searchPhraseCount: group.wordstat.length, snippetCount: group.serp.length,
      distinctSearchPages: new Set(group.serp.map(p=>p.url)).size,
      bestObservedWordstatCount: knownCounts.length ? Math.max(...knownCounts) : null,
      wordstatCountMeaning: 'Largest observed overlapping phrase count; not unique people or sum of demand.',
      needsReviewCount: group.review, firsthandSnippetCandidates: group.firsthandCandidates,
      evidence: { wordstat: group.wordstat.slice(0,8), serp: group.serp.slice(0,8) },
    };
  }).sort((a,b)=>b.distinctSearchPages-a.distinctSearchPages || b.searchPhraseCount-a.searchPhraseCount);

  return {
    schemaVersion:1, source:'yaai-pain-discovery', generatedAt:new Date().toISOString(),
    topic: clean(topic),
    input: {
      wordstatGeneratedAt: wordstat?.generatedAt || null,
      serpGeneratedAt: serp?.generatedAt || null, region: serp?.region || null,
      evidenceItemCount: evidenceItems.length, classifiedCount: classifications.length,
    },
    summary: {
      painCategories: cards.length, acceptedEvidence: classifications.filter(x=>x.accepted).length,
      rejectedEvidence: classifications.filter(x=>!x.accepted).length,
      uncertainEvidence: classifications.filter(x=>x.accepted && x.needsReview).length,
      measuredModelCostUsd: evaluations.summary?.totalCost ?? null,
    },
    cards, classifications,
    // Keep every evaluated source observation, including Jev negatives, for unbiased human review.
    // A cards-only report cannot measure false negatives or recall.
    evidenceLedger: classifications.map(cls => ({
      ...sources.get(cls.evidenceId),
      classification: cls,
    })),
    methodology: [
      'Wordstat phrase counts overlap; do not infer complaints, people or market size.',
      'SERP snippets are limited search excerpts, not verified firsthand customer statements.',
      'Jev probability and certainty are uncalibrated and not proof of truth.',
      'Every card is a hypothesis until independently verified.',
    ],
  };
}

export function painMapMarkdown(map) {
  if (!Array.isArray(map?.cards)) throw new Error('Expected a saved Pain Map with cards.');
  const lines = [
    '# Карта болей: ' + map.topic,
    '',
    'Источник: Wordstat и/или Yandex Search API. Все категории — гипотезы до независимой проверки.',
    '',
    '- Категорий: ' + map.summary.painCategories,
    '- Принятых свидетельств: ' + map.summary.acceptedEvidence,
    '- Требуют проверки: ' + map.summary.uncertainEvidence,
    '- Измеренная стоимость Jev, USD: ' + (map.summary.measuredModelCostUsd ?? 'не указана'),
    '',
  ];
  for (const card of map.cards) {
    lines.push('## ' + card.title, '');
    lines.push('- Статус: гипотеза, требует проверки');
    lines.push('- Поисковых фраз: ' + card.searchPhraseCount);
    lines.push('- Страниц в SERP: ' + card.distinctSearchPages);
    lines.push('- Максимальная наблюдённая частотность одной фразы: ' + (card.bestObservedWordstatCount ?? 'нет данных'));
    lines.push('- Неуверенных классификаций: ' + card.needsReviewCount, '');
    for (const phrase of card.evidence.wordstat) {
      lines.push('- Wordstat: "' + phrase.query.replace(/[\n\r]/g,' ') + '" — ' + (phrase.observedCount ?? 'частотность неизвестна'));
    }
    for (const result of card.evidence.serp) {
      lines.push('- SERP: ' + (result.title || result.query).replace(/[\n\r]/g,' ') +
        ' — ' + result.url + ' (фрагмент: ' + result.excerpt.replace(/[\n\r]/g,' ').slice(0, 230) + ')');
    }
    lines.push('');
  }
  lines.push('## Ограничения',...map.methodology.map(x=>'- '+x),'');
  return lines.join('\n');
}
