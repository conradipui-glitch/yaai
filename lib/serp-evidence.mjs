function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<hlword>([\s\S]*?)<\/hlword>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const match = String(block || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function normalizeUrl(value) {
  const raw = decodeXml(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizedResult(item, fallbackPosition) {
  const url = normalizeUrl(item.url);
  const domain = normalizeDomain(item.domain || url);
  const position = Number(item.position || fallbackPosition);
  return {
    position: Number.isFinite(position) && position > 0 ? Math.trunc(position) : fallbackPosition,
    url,
    domain,
    title: decodeXml(item.title),
    passage: decodeXml(item.passage),
  };
}

export function parseYandexSearchXml(xml) {
  const source = String(xml || '');
  if (!source.trim()) throw new Error('Yandex Search XML is empty.');

  const error = source.match(/<error(?:\s[^>]*)?>([\s\S]*?)<\/error>/i);
  if (error) throw new Error(`Yandex Search XML error: ${decodeXml(error[1]) || 'unknown error'}`);

  const docs = [...source.matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/gi)];
  const results = docs.map((match, index) => {
    const block = match[1];
    const url = tag(block, 'url');
    const domain = tag(block, 'domain') || normalizeDomain(url);
    const title = tag(block, 'title');
    const passageMatch = block.match(/<passage(?:\s[^>]*)?>([\s\S]*?)<\/passage>/i);
    const serpPosition = Number(tag(block, 'serp-pos'));
    return normalizedResult({
      position: Number.isFinite(serpPosition) && serpPosition > 0 ? serpPosition : index + 1,
      url,
      domain,
      title,
      passage: passageMatch ? passageMatch[1] : '',
    }, index + 1);
  }).filter((item) => item.url && item.domain);

  return {
    query: tag(source, 'query'),
    found: Number(tag(source, 'found')) || null,
    results,
  };
}

export function decodeYandexSearchResponse(payload) {
  const rawData = payload?.rawData;
  if (!rawData || typeof rawData !== 'string') {
    throw new Error('Yandex Search API response is missing rawData.');
  }
  let xml;
  try {
    xml = Buffer.from(rawData, 'base64').toString('utf8');
  } catch {
    throw new Error('Could not decode Yandex Search API rawData.');
  }
  return parseYandexSearchXml(xml);
}

function safeQueryRecord(record) {
  const query = String(record?.query || '').trim();
  if (!query) return null;
  const results = Array.isArray(record.results)
    ? record.results.map((item, index) => normalizedResult(item, index + 1)).filter((item) => item.url && item.domain)
    : [];
  return { query, results };
}

function competitorRow(domain) {
  return {
    domain,
    queryCount: 0,
    appearances: 0,
    top3: 0,
    top10: 0,
    bestPosition: null,
    positionSum: 0,
    visibilityScore: 0,
    queries: [],
  };
}

export function analyzeSerpEvidence(dataset, {
  ownDomain = '',
  topN = 10,
} = {}) {
  if (!dataset || !Array.isArray(dataset.queries)) {
    throw new Error('SERP evidence JSON must contain a queries array.');
  }

  const own = normalizeDomain(ownDomain || dataset.ownDomain || '');
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(topN || 10))));
  const queryRows = [];
  const domains = new Map();

  for (const raw of dataset.queries) {
    const record = safeQueryRecord(raw);
    if (!record) continue;
    const results = record.results
      .filter((item) => item.position <= limit)
      .sort((a, b) => a.position - b.position);

    const ownResults = own ? results.filter((item) => item.domain === own || item.domain.endsWith(`.${own}`)) : [];
    const ownBest = ownResults[0] || null;
    const seenDomains = new Set();

    for (const result of results) {
      const domain = result.domain;
      if (!domain) continue;
      const row = domains.get(domain) || competitorRow(domain);
      row.appearances += 1;
      row.positionSum += result.position;
      row.bestPosition = row.bestPosition == null ? result.position : Math.min(row.bestPosition, result.position);
      if (result.position <= 3) row.top3 += 1;
      if (result.position <= 10) row.top10 += 1;
      row.visibilityScore += Math.max(0, limit + 1 - result.position);
      if (!seenDomains.has(domain)) {
        row.queryCount += 1;
        row.queries.push({ query: record.query, position: result.position, url: result.url });
        seenDomains.add(domain);
      }
      domains.set(domain, row);
    }

    const aboveOwn = ownBest
      ? results.filter((item) => item.position < ownBest.position && item.domain !== ownBest.domain)
      : results.filter((item) => !own || (item.domain !== own && !item.domain.endsWith(`.${own}`)));

    queryRows.push({
      query: record.query,
      resultCount: results.length,
      ownPresent: Boolean(ownBest),
      ownPosition: ownBest?.position ?? null,
      ownUrl: ownBest?.url ?? null,
      topDomains: results.slice(0, Math.min(5, limit)).map((item) => ({
        position: item.position,
        domain: item.domain,
        url: item.url,
        title: item.title,
      })),
      domainsAboveOwn: aboveOwn.map((item) => ({
        position: item.position,
        domain: item.domain,
        url: item.url,
        title: item.title,
      })),
      gapType: own
        ? ownBest
          ? (ownBest.position <= 3 ? 'own-top3' : ownBest.position <= 10 ? 'own-top10' : 'own-visible')
          : 'own-absent'
        : 'domain-not-specified',
    });
  }

  const domainRows = [...domains.values()].map((row) => ({
    domain: row.domain,
    queryCount: row.queryCount,
    appearances: row.appearances,
    top3: row.top3,
    top10: row.top10,
    bestPosition: row.bestPosition,
    averagePosition: row.appearances
      ? Number((row.positionSum / row.appearances).toFixed(2))
      : null,
    visibilityScore: row.visibilityScore,
    queries: row.queries.sort((a, b) => a.position - b.position || a.query.localeCompare(b.query, 'ru')),
    isOwnDomain: Boolean(own && (row.domain === own || row.domain.endsWith(`.${own}`))),
  })).sort((a, b) =>
    b.queryCount - a.queryCount
    || b.visibilityScore - a.visibilityScore
    || (a.averagePosition ?? 999) - (b.averagePosition ?? 999)
    || a.domain.localeCompare(b.domain)
  );

  const competitors = domainRows.filter((row) => !row.isOwnDomain);
  const ownRow = domainRows.find((row) => row.isOwnDomain) || null;
  const ownAbsent = queryRows.filter((row) => row.gapType === 'own-absent');

  return {
    meta: {
      generatedAt: dataset.generatedAt || null,
      source: dataset.source || 'unknown',
      region: dataset.region || null,
      searchType: dataset.searchType || null,
      queryCount: queryRows.length,
      topN: limit,
      ownDomain: own || null,
      note: 'SERP evidence is a sampled Yandex Search API snapshot. It describes observed result ordering for the collected query/region/time, not durable ranking or market share.',
    },
    own: {
      domain: own || null,
      domainSummary: ownRow,
      presentQueries: queryRows.filter((row) => row.ownPresent).length,
      absentQueries: ownAbsent.length,
      absent: ownAbsent,
    },
    competitors,
    queries: queryRows,
  };
}
