// Deliberately conservative offline source-selection rules.
// Exclude only unambiguous off-domain homonyms. Keep uncertain candidates
// visible for review rather than assuming a search term implies buyer pain.

function normalized(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function isLeadOrRequestTopic(topic) {
  const text = normalized(topic);
  return /(заявк|заявок|заявки|лидогенерац|лиды|лидов|crm|црм|воронк|продаж|обработк\s+заяв)/u.test(text);
}
const leadContext = /(заявк|заявок|заявки|клиент|лидогенерац|лиды|лидов|crm|црм|воронк|продаж|обработк|конверс|маркетинг|менеджер)/u;

export const WORDSTAT_RELEVANCE_RULESET = 'wordstat-domain-homonyms-v1';

export function assessPainWordstatPhrase({topic, phrase} = {}) {
  const query = normalized(phrase);
  if (!query) return {decision:'review', reason:'empty-phrase'};
  if (!isLeadOrRequestTopic(topic)) return {decision:'keep', reason:'no-domain-specific-exclusions'};

  // These patterns are specifically about proper names, not marketing leads.
  // They are not a global blocklist, since "Лида" can be a valid topic itself.
  if (/(?:^| )(?:с днем рождения|поздравлен\p{L}*|поздравляю|открытк\p{L}*|именин\p{L}*)(?: |$)/u.test(query) &&
      /(?:^| )(?:лида|лиде|лидой|тетя лида)(?: |$)/u.test(query)) {
    return {decision:'exclude', reason:'person-name-greetings'};
  }
  if (/(?:^| )(?:дорогая лида|дорогой лиде|дорогую лиду)(?: |$)/u.test(query) &&
      !leadContext.test(query)) {
    return {decision:'exclude', reason:'person-name-address'};
  }
  if (/(?:петр|пётр)\s+лидов|солдатов\s+петр\s+лидов|дорогая редакция.*лидов/u.test(query)) {
    return {decision:'exclude', reason:'person-surname'};
  }

  // "дороги", "дорога", "железной дороги" are not "дорогие лиды".
  // Requiring absence of business context prevents discarding metaphorical
  // phrases such as "дорога клиента".
  if (/(?:^|\s)дорог(?:а|и|у|ой|е|ах|ами)(?:\s|$)/u.test(query) &&
      !leadContext.test(query)) {
    return {decision:'exclude', reason:'roads-not-marketing-cost'};
  }

  if (leadContext.test(query)) return {decision:'keep', reason:'topic-context-present'};
  return {decision:'review', reason:'topic-context-unclear'};
}

export function auditPainWordstatCandidates({topic, candidates = []} = {}) {
  if (!Array.isArray(candidates)) throw Error('Wordstat relevance candidates must be an array.');
  const excluded = [], review = [];
  let kept = 0;
  for (const row of candidates) {
    const phrase = String(row?.phrase ?? '').trim();
    if (!phrase) continue;
    const verdict = assessPainWordstatPhrase({topic,phrase});
    if (verdict.decision === 'exclude') {
      excluded.push({phrase, count:row.count ?? null, reason:verdict.reason});
    } else {
      kept++;
      if (verdict.decision === 'review') {
        review.push({phrase,reason:verdict.reason});
      }
    }
  }
  return {
    version:1, ruleset:WORDSTAT_RELEVANCE_RULESET,
    scope:'wordstat-problem-candidates',
    examined:candidates.filter(x=>String(x?.phrase??'').trim()).length,
    retained:kept, excludedCount:excluded.length,
    reviewCount:review.length, excluded, review,
    note:'Deterministic disambiguation only. Excluded phrases remain in original Wordstat source; uncertain queries are not silently discarded or counted as validated complaints.',
  };
}
