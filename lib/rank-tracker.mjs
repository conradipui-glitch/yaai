const COLUMN_NAMES = {
  date: ['date', 'дата'],
  host: ['host', 'хост'],
  query: ['query', 'searchquery', 'searchphrase', 'запрос', 'поисковыйзапрос'],
  url: ['url', 'page', 'pageurl', 'страница', 'адресстраницы', 'urlстраницы'],
  region: ['region', 'regionname', 'регион'],
  impressions: ['impressions', 'shows', 'показы', 'показов'],
  clicks: ['clicks', 'клики', 'кликов'],
  position: ['position', 'avgposition', 'averageposition', 'позиция', 'средняяпозиция'],
};

function parseCsv(source, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error('Unclosed CSV field.');
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function normalizeHeading(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/[^a-zа-яё0-9]+/gi, '');
}

function toNumber(value) {
  const result = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function normalizeQuery(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function normalizePage(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  try {
    const absolute = new URL(clean, 'https://example.invalid');
    let pathname = absolute.pathname;
    if (!pathname.endsWith('/')) pathname += '/';
    return pathname;
  } catch {
    return clean;
  }
}

function normalizeDate(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function averagePosition(weighted, impressions, observations) {
  const divisor = impressions > 0 ? impressions : observations;
  return divisor > 0 ? Number((weighted / divisor).toFixed(2)) : null;
}

function ctr(clicks, impressions) {
  return impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
}

function pairKey(row) {
  return [row.query, row.url, row.region].join('\u0000');
}

function aggregateQueries(rows) {
  const queries = new Map();

  for (const row of rows) {
    const item = queries.get(row.query) || {
      query: row.query,
      impressions: 0,
      clicks: 0,
      weightedPosition: 0,
      positionWeight: 0,
      urls: new Set(),
      regions: new Set(),
    };

    item.impressions += row.impressions;
    item.clicks += row.clicks;
    if (row.averagePosition != null) {
      const weight = row.impressions > 0 ? row.impressions : 1;
      item.weightedPosition += row.averagePosition * weight;
      item.positionWeight += weight;
    }
    item.urls.add(row.url);
    if (row.region) item.regions.add(row.region);
    queries.set(row.query, item);
  }

  return [...queries.values()].map((item) => ({
    query: item.query,
    impressions: item.impressions,
    clicks: item.clicks,
    ctr: ctr(item.clicks, item.impressions),
    averagePosition: item.positionWeight > 0
      ? Number((item.weightedPosition / item.positionWeight).toFixed(2))
      : null,
    urls: [...item.urls].sort(),
    regions: [...item.regions].sort(),
    urlCount: item.urls.size,
  }));
}

function movement(before, after) {
  const previousPosition = before?.averagePosition ?? null;
  const currentPosition = after?.averagePosition ?? null;
  const positionDelta = previousPosition != null && currentPosition != null
    ? Number((previousPosition - currentPosition).toFixed(2))
    : null;

  return {
    query: after?.query || before?.query || '',
    previousPosition,
    currentPosition,
    positionDelta,
    previousImpressions: before?.impressions || 0,
    currentImpressions: after?.impressions || 0,
    impressionDelta: (after?.impressions || 0) - (before?.impressions || 0),
    previousClicks: before?.clicks || 0,
    currentClicks: after?.clicks || 0,
    previousCtr: before?.ctr || 0,
    currentCtr: after?.ctr || 0,
    urls: after?.urls || before?.urls || [],
    urlCount: after?.urlCount ?? before?.urlCount ?? 0,
    regions: after?.regions || before?.regions || [],
  };
}

function positionBuckets(rows) {
  const counts = { top3: 0, top10: 0, top20: 0, beyond20: 0, unknown: 0 };
  for (const row of rows) {
    const position = row.averagePosition;
    if (position == null || position <= 0) counts.unknown += 1;
    else if (position <= 3) counts.top3 += 1;
    else if (position <= 10) counts.top10 += 1;
    else if (position <= 20) counts.top20 += 1;
    else counts.beyond20 += 1;
  }
  return counts;
}

export function analyzeRankTrackerCsv(source, {
  minImpressions = 1,
  strikingStart = 5,
  strikingEnd = 20,
} = {}) {
  const input = String(source || '').replace(/^\ufeff/, '');
  const choices = [',', ';', '\t']
    .map((delimiter) => ({ delimiter, rows: parseCsv(input, delimiter) }))
    .sort((a, b) => (b.rows[0]?.length || 0) - (a.rows[0]?.length || 0));
  const choice = choices[0];

  if (!choice?.rows?.length) throw new Error('Webmaster CSV is empty.');

  const headings = choice.rows[0].map(normalizeHeading);
  const indexes = Object.fromEntries(Object.entries(COLUMN_NAMES).map(([key, aliases]) => [
    key,
    headings.findIndex((heading) => aliases.includes(heading)),
  ]));

  for (const key of ['date', 'query', 'url', 'impressions', 'clicks', 'position']) {
    if (indexes[key] < 0) {
      throw new Error(`Webmaster CSV is missing column: ${key}. Headers: ${choice.rows[0].join(' | ')}`);
    }
  }

  const threshold = Math.max(1, Math.trunc(Number(minImpressions || 1)));
  const strikeFrom = Math.max(1, Number(strikingStart || 5));
  const strikeTo = Math.max(strikeFrom, Number(strikingEnd || 20));
  const totals = new Map();
  let acceptedRows = 0;

  for (const line of choice.rows.slice(1)) {
    const date = normalizeDate(line[indexes.date]);
    const query = normalizeQuery(line[indexes.query]);
    const url = normalizePage(line[indexes.url]);
    if (!date || !query || !url) continue;

    const impressions = toNumber(line[indexes.impressions]);
    const clicks = toNumber(line[indexes.clicks]);
    const position = toNumber(line[indexes.position]);
    const region = indexes.region >= 0 ? String(line[indexes.region] || '').trim() : '';
    const host = indexes.host >= 0 ? String(line[indexes.host] || '').trim() : '';

    acceptedRows += 1;
    const key = [date, query, url, region].join('\u0000');
    const item = totals.get(key) || {
      date,
      query,
      url,
      region,
      host,
      impressions: 0,
      clicks: 0,
      weightedPosition: 0,
      positionObservations: 0,
    };

    item.impressions += impressions;
    item.clicks += clicks;
    if (position > 0) {
      const weight = impressions > 0 ? impressions : 1;
      item.weightedPosition += position * weight;
      item.positionObservations += weight;
    }
    totals.set(key, item);
  }

  const rows = [...totals.values()].map((item) => ({
    date: item.date,
    query: item.query,
    url: item.url,
    region: item.region,
    host: item.host,
    impressions: item.impressions,
    clicks: item.clicks,
    ctr: ctr(item.clicks, item.impressions),
    averagePosition: averagePosition(item.weightedPosition, item.positionObservations, item.positionObservations),
  }));

  const dates = [...new Set(rows.map((row) => row.date))].sort();
  if (!dates.length) throw new Error('Webmaster CSV contains no valid dated rows.');

  const currentDate = dates.at(-1);
  const previousDate = dates.length >= 2 ? dates.at(-2) : null;
  const currentRows = rows.filter((row) => row.date === currentDate);
  const previousRows = previousDate ? rows.filter((row) => row.date === previousDate) : [];

  const currentQueries = aggregateQueries(currentRows)
    .filter((row) => row.impressions >= threshold)
    .sort((a, b) => b.impressions - a.impressions || (a.averagePosition ?? 999) - (b.averagePosition ?? 999));
  const previousQueries = aggregateQueries(previousRows)
    .filter((row) => row.impressions >= threshold);

  const currentMap = new Map(currentQueries.map((row) => [row.query, row]));
  const previousMap = new Map(previousQueries.map((row) => [row.query, row]));

  const shared = [];
  const newQueries = [];
  const lostQueries = [];

  for (const [query, after] of currentMap) {
    const before = previousMap.get(query);
    if (!before) newQueries.push(movement(null, after));
    else shared.push(movement(before, after));
  }

  for (const [query, before] of previousMap) {
    if (!currentMap.has(query)) lostQueries.push(movement(before, null));
  }

  const improvements = shared
    .filter((row) => row.positionDelta != null && row.positionDelta >= 1)
    .sort((a, b) => b.positionDelta - a.positionDelta || b.currentImpressions - a.currentImpressions);
  const declines = shared
    .filter((row) => row.positionDelta != null && row.positionDelta <= -1)
    .sort((a, b) => a.positionDelta - b.positionDelta || b.currentImpressions - a.currentImpressions);

  const strikingDistance = currentQueries
    .filter((row) => row.averagePosition != null
      && row.averagePosition >= strikeFrom
      && row.averagePosition <= strikeTo)
    .sort((a, b) => b.impressions - a.impressions || a.averagePosition - b.averagePosition);

  const previousPairs = new Map(previousRows
    .filter((row) => row.impressions >= threshold)
    .map((row) => [pairKey(row), row]));
  const pageMovements = currentRows
    .filter((row) => row.impressions >= threshold)
    .map((after) => {
      const before = previousPairs.get(pairKey(after));
      if (!before) return null;
      return {
        query: after.query,
        url: after.url,
        region: after.region,
        previousPosition: before.averagePosition,
        currentPosition: after.averagePosition,
        positionDelta: before.averagePosition != null && after.averagePosition != null
          ? Number((before.averagePosition - after.averagePosition).toFixed(2))
          : null,
        previousImpressions: before.impressions,
        currentImpressions: after.impressions,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.positionDelta || 0) - Math.abs(a.positionDelta || 0)
      || b.currentImpressions - a.currentImpressions);

  return {
    meta: {
      inputRows: acceptedRows,
      normalizedRows: rows.length,
      dates,
      currentDate,
      previousDate,
      minImpressions: threshold,
      strikingDistance: { from: strikeFrom, to: strikeTo },
      note: 'Positions are Yandex Webmaster average positions, not live point-in-time SERP ranks. Query-level position is impression-weighted across matching URLs/regions.',
    },
    current: {
      queryCount: currentQueries.length,
      impressions: currentQueries.reduce((sum, row) => sum + row.impressions, 0),
      clicks: currentQueries.reduce((sum, row) => sum + row.clicks, 0),
      positionBuckets: positionBuckets(currentQueries),
      queries: currentQueries,
    },
    comparison: previousDate ? {
      comparable: true,
      previousDate,
      currentDate,
      sharedQueries: shared.length,
      improvements,
      declines,
      newQueries: newQueries.sort((a, b) => b.currentImpressions - a.currentImpressions),
      lostQueries: lostQueries.sort((a, b) => b.previousImpressions - a.previousImpressions),
      strikingDistance,
      pageMovements,
    } : {
      comparable: false,
      reason: 'need_two_dates',
      previousDate: null,
      currentDate,
      sharedQueries: 0,
      improvements: [],
      declines: [],
      newQueries: [],
      lostQueries: [],
      strikingDistance,
      pageMovements: [],
    },
  };
}
