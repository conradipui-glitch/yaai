const COLUMN_NAMES = {
  query: ['query', 'searchquery', 'searchphrase', 'запрос', 'поисковыйзапрос'],
  url: ['url', 'page', 'pageurl', 'страница', 'адресстраницы', 'urlстраницы'],
  impressions: ['impressions', 'shows', 'показы', 'показов'],
  clicks: ['clicks', 'клики', 'кликов'],
  position: ['position', 'позиция', 'средняяпозиция'],
};

function parseCsv(source, delimiter) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Unclosed CSV field.');
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function normalizeHeading(value) {
  return String(value || '').toLowerCase().replace(/^\ufeff/, '').replace(/[\s_\-/()]+/g, '');
}
function toNumber(value) {
  const result = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(result) && result >= 0 ? result : 0;
}
function normalizePage(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  try {
    const absolute = new URL(clean, 'https://example.invalid');
    let pathname = absolute.pathname;
    if (!pathname.endsWith('/')) pathname += '/';
    return pathname;
  } catch { return clean; }
}

export function analyzeWebmasterCsv(source, { minImpressions = 1 } = {}) {
  const input = String(source || '').replace(/^\ufeff/, '');
  const delimiters = [',', ';', '\t'];
  const choices = delimiters.map((delimiter) => ({ delimiter, rows: parseCsv(input, delimiter) }));
  const choice = choices.sort((a, b) => (b.rows[0]?.length || 0) - (a.rows[0]?.length || 0))[0];
  if (!choice.rows.length) throw new Error('Webmaster CSV is empty.');
  const headings = choice.rows[0].map(normalizeHeading);
  const indexes = Object.fromEntries(Object.entries(COLUMN_NAMES).map(([key, aliases]) =>
    [key, headings.findIndex((heading) => aliases.includes(heading))]));
  for (const key of ['query', 'url', 'impressions', 'clicks']) {
    if (indexes[key] < 0) throw new Error(`Webmaster CSV is missing column: ${key}. Headers: ${choice.rows[0].join(' | ')}`);
  }
  const totals = new Map();
  let acceptedRows = 0;
  for (const line of choice.rows.slice(1)) {
    const query = String(line[indexes.query] || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
    const url = normalizePage(line[indexes.url]);
    if (!query || !url) continue;
    const impressions = toNumber(line[indexes.impressions]);
    const clicks = toNumber(line[indexes.clicks]);
    const position = indexes.position < 0 ? 0 : toNumber(line[indexes.position]);
    acceptedRows += 1;
    const key = `${query}\u0000${url}`;
    const row = totals.get(key) || { query, url, impressions: 0, clicks: 0, weightedPosition: 0 };
    row.impressions += impressions;
    row.clicks += clicks;
    row.weightedPosition += position * impressions;
    totals.set(key, row);
  }
  const queries = new Map();
  for (const item of totals.values()) {
    if (item.impressions < minImpressions) continue;
    const pages = queries.get(item.query) || [];
    pages.push({ url: item.url, impressions: item.impressions, clicks: item.clicks,
      averagePosition: item.impressions ? Number((item.weightedPosition / item.impressions).toFixed(2)) : null });
    queries.set(item.query, pages);
  }
  const overlaps = [...queries.entries()].filter(([, pages]) => pages.length >= 2)
    .map(([query, pages]) => ({ query, totalImpressions: pages.reduce((sum, row) => sum + row.impressions, 0),
      pages: pages.sort((a, b) => b.impressions - a.impressions) }))
    .sort((a, b) => b.totalImpressions - a.totalImpressions);
  return { inputRows: acceptedRows, distinctQueryPages: totals.size, candidateCount: overlaps.length,
    note: 'Multiple URL appearances for a query are only overlap candidates, not proof of harmful cannibalization.', overlaps };
}
