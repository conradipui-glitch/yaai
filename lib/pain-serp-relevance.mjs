import { assessPainWordstatPhrase } from './pain-relevance.mjs';

export const SERP_RELEVANCE_RULESET = 'serp-evidence-relevance-v1';

const normalize = value => String(value ?? '')
  .toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const businessContext = /(?:^| )(?:лид(?:ы|ов|ами)?|(?:заявк\p{L}*|заявок)|клиент\p{L}*|crm|црм|маркетинг\p{L}*|конверс\p{L}*|воронк\p{L}*|продаж\p{L}*|менеджер\p{L}*)(?: |$)/u;
const name = /(?:^| )(?:лида|лиде|лидой|лиду)(?: |$)/u;
const greeting = /(?:^| )(?:поздрав\p{L}*|открытк\p{L}*|именин\p{L}*|с днем рождения)(?: |$)/u;
const roads = /(?:железн\p{L}* дорог\p{L}*|ремонт дорог|асфальт\p{L}*|автомобильн\p{L}* дорог\p{L}*|дорожн\p{L}* покрыт\p{L}*)/u;

function marketingTopic(topic) {
  const text = normalize(topic);
  return /(?:(?:заявк\p{L}*|заявок)|лидогенерац\p{L}*|crm|црм|воронк\p{L}*|продаж\p{L}*|маркетинг\p{L}*|конверс\p{L}*)/u.test(text) ||
    /(?:^| )лиды(?: |$)/u.test(text);
}

function topicOverlap(topic, title, passage) {
  const words = normalize(topic).split(' ')
    .filter(token => token.length >= 5 && !['работы','работа','услуги','услуга','омске','омск'].includes(token));
  if (!words.length) return true; // Cannot establish an absence of overlap.
  const evidenceWords = normalize(title + ' ' + passage).split(' ');
  return words.some(topicWord =>
    evidenceWords.some(word => word.slice(0, 5) === topicWord.slice(0, 5)));
}

/**
 * An intentionally narrow pre-Jev source gate. Review decisions are retained.
 * Search rank, commercial voice and unusual subject matter are not themselves
 * exclusion grounds: Jev still needs negatives for QA.
 */
export function assessPainSerpResult({ topic, query, title, passage } = {}) {
  const doc = normalize(String(title ?? '') + ' ' + String(passage ?? ''));
  const headline = normalize(title);
  if (!doc) return { decision:'review', reason:'empty-search-excerpt' };

  if (marketingTopic(topic)) {
    const queryCheck = assessPainWordstatPhrase({topic, phrase:query});
    if (queryCheck.decision === 'exclude') {
      return {decision:'exclude', reason:'off-topic-query-' + queryCheck.reason};
    }
    // Don't exclude mixed pages, e.g. a marketing article quoting a greeting
    // as an example. Require unambiguous headline context and text
    // without marketing/request-related language.
    if (name.test(headline) && greeting.test(doc) && !businessContext.test(doc)) {
      return {decision:'exclude', reason:'personal-name-greeting-result'};
    }
    if (roads.test(headline) && roads.test(doc) && !businessContext.test(doc)) {
      return {decision:'exclude', reason:'literal-road-result'};
    }
    if (/(?:петр лидов|солдатов петр лидов)/u.test(headline) &&
        !businessContext.test(doc)) {
      return {decision:'exclude', reason:'person-surname-result'};
    }
  }
  if (marketingTopic(topic) && businessContext.test(doc)) {
    return {decision:'keep', reason:'business-domain-context'};
  }
  if (!topicOverlap(topic, title, passage)) {
    return {decision:'review', reason:'topic-not-explicit-in-excerpt'};
  }
  return {decision:'keep', reason:'no-clear-topic-mismatch'};
}

/**
 * Inspect unique structurally valid SERP snippets across all search queries,
 * not just the paid Jev sample. Neither returned rows nor source are mutated.
 */
export function inspectPainSerpCandidates({topic, serp} = {}) {
  if (serp == null) return {retained:[], audit:null};
  if (!Array.isArray(serp.queries)) throw new Error('SERP relevance requires queries array.');
  const retained = [], excluded = [], review = [], seen = new Set();
  let examined = 0;
  for (const block of serp.queries) {
    const query = String(block?.query ?? '').replace(/\s+/g,' ').trim();
    if (!query) continue;
    if (!Array.isArray(block?.results)) throw new Error('SERP query results must be an array.');
    for (const result of block.results) {
      const url = String(result?.url ?? '').trim();
      const title = String(result?.title ?? '').replace(/\s+/g,' ').trim().slice(0,400);
      const passage = String(result?.passage ?? '').replace(/\s+/g,' ').trim().slice(0,1500);
      if (!/^https?:\/\/\S+$/i.test(url) || !(title || passage)) continue;
      const key = 'serp|' + url + '|' + passage;
      if (seen.has(key)) continue;
      seen.add(key);
      examined++;
      const item = { query, url, title, passage, position: result.position };
      const verdict = assessPainSerpResult({topic,query,title,passage});
      if (verdict.decision === 'exclude') {
        excluded.push({query, url, title, excerpt:passage || title, reason:verdict.reason});
      } else {
        retained.push({...item, relevanceDecision:verdict.decision, relevanceReason:verdict.reason});
        if (verdict.decision === 'review') {
          review.push({query,url,reason:verdict.reason});
        }
      }
    }
  }
  return {retained, audit:{
    version:1, ruleset:SERP_RELEVANCE_RULESET,
    scope:'valid-unique-serp-snippets-before-jev-limit',
    examined, retained:retained.length, excludedCount:excluded.length,
    reviewCount:review.length, excluded, review,
    note:'Exclude only unmistakable off-topic homonyms; missing literal topic words are flagged for review, not discarded. Excluded results remain in original SERP JSON and are not Jev negatives.',
  }};
}
