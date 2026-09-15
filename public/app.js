const $ = (id) => document.getElementById(id);
let allRegions = [];
let lastRows = [];
let lastAnalysis = null;

const TYPE_LABEL = {
  commercial: 'Commercial',
  informational: 'Informational',
  unmapped: 'Unmapped',
  noise: 'Noise',
};

const ACTION_LABEL = {
  landing: 'Делать landing',
  guide: 'Делать guide',
  hold: 'Пока не делать',
};

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function selectedRegions() {
  return [...document.querySelectorAll('.region input:checked')]
    .map((input) => ({ id: input.dataset.id, name: input.dataset.name }));
}

function renderRegions() {
  const query = $('regionSearch').value.trim().toLowerCase();
  const items = allRegions.filter((region) => !query || region.path.toLowerCase().includes(query)).slice(0, 300);
  $('regions').innerHTML = items.length
    ? items.map((region) => `<label class="region"><input type="checkbox" data-id="${esc(region.id)}" data-name="${esc(region.name)}"><span><b>${esc(region.name)}</b><br><span class="muted">${esc(region.path)} · ID ${esc(region.id)}</span></span></label>`).join('')
    : '<div class="muted">Ничего не найдено.</div>';
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({ error: 'Некорректный ответ сервера' }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function downloadCsv(filename, headers, rows) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [headers.join(','), ...rows.map((row) => row.map(quote).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function pill(value, extra = '') {
  return `<span class="pill ${esc(extra || value)}">${esc(value)}</span>`;
}

function metric(title, value, note = '') {
  return `<div class="metric"><span class="muted">${esc(title)}</span><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
}

function renderRaw(data) {
  const meta = data.meta;
  $('metrics').innerHTML = [
    metric('Строк', meta.rows),
    metric('API вызовов', meta.apiCalls),
    metric('Из кэша', meta.cachedCalls),
    metric('Seed', meta.seeds),
  ].join('');

  $('tbody').innerHTML = lastRows.slice(0, 5000).map((row) => `<tr>
    <td><b>${esc(row.phrase)}</b></td>
    <td>${esc(row.regionName)} <span class="muted">(${esc(row.regionId)})</span></td>
    <td>${Number(row.count).toLocaleString('ru-RU')}</td>
    <td>${(row.types || []).map((type) => pill(type)).join('')}</td>
    <td>${(row.seeds || []).map((seed) => pill(seed)).join('')}</td>
  </tr>`).join('');
}

function renderAnalysis(data) {
  const meta = data.meta;
  const q = meta.queryTypeCounts || {};
  const a = meta.nextActionCounts || {};

  $('analysisMetrics').innerHTML = [
    metric('Подошло', meta.eligibleRows, 'после фильтра'),
    metric('Разложено', meta.assignedRows, 'по intent'),
    metric('Commercial', q.commercial || 0, `landing: ${a.landing || 0}`),
    metric('Informational', q.informational || 0, `guide: ${a.guide || 0}`),
    metric('Unmapped', q.unmapped || 0, 'нужна проверка'),
    metric('Noise', q.noise || 0, 'отсечено'),
  ].join('');

  const intentRows = (data.summary || []).filter((item) => item.phraseCount > 0);
  $('intentBody').innerHTML = intentRows.length ? intentRows.map((item) => `<tr>
    <td><b>${esc(item.intentId)}</b></td>
    <td><b>${esc(item.intentTitle)}</b><br><span class="muted">${esc(item.cluster)}</span></td>
    <td>${esc(item.regionName)}</td>
    <td>${esc(item.businessPriority || '—')}</td>
    <td>${pill(item.relativeDemandBand, item.relativeDemandBand)} #${item.relativeRank ?? '—'}<br><span class="muted">max ${Number(item.maxCount).toLocaleString('ru-RU')}</span></td>
    <td>${pill(TYPE_LABEL[item.dominantQueryType] || item.dominantQueryType, item.dominantQueryType)}</td>
    <td>${pill(ACTION_LABEL[item.nextAction] || item.nextAction, item.nextAction)}</td>
    <td>${esc(item.strongestPhrase)}${item.strongestPhrase ? ` — <b>${Number(item.maxCount).toLocaleString('ru-RU')}</b>` : ''}</td>
  </tr>`).join('') : '<tr><td colspan="8" class="muted">Подходящих intent-кластеров не найдено.</td></tr>';

  const classified = data.classifiedRows || [];
  $('actionBody').innerHTML = classified.slice(0, 1000).map((row) => `<tr>
    <td><b>${esc(row.phrase)}</b><br><span class="muted">${esc(row.analysisStatus || '')}</span></td>
    <td>${esc(row.regionName)}</td>
    <td>${Number(row.count || 0).toLocaleString('ru-RU')}</td>
    <td>${pill(TYPE_LABEL[row.queryType] || row.queryType, row.queryType)}</td>
    <td>${row.intentId ? `<b>${esc(row.intentId)}</b> · ${esc(row.intentTitle)}` : '<span class="muted">не привязан</span>'}</td>
    <td>${pill(ACTION_LABEL[row.nextAction] || row.nextAction, row.nextAction)}</td>
    <td>${esc(row.queryConfidence || '—')}<br><span class="muted">${esc(row.querySource || '')}</span></td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">Нет классифицированных строк.</td></tr>';

  $('intentCsvBtn').disabled = !intentRows.length;
  $('queryCsvBtn').disabled = !classified.length;
}

async function init() {
  try {
    const [config, presets] = await Promise.all([api('/api/config'), api('/api/presets')]);
    if (config.defaultFolderId) {
      $('folderId').value = config.defaultFolderId;
      localStorage.setItem('folderId', config.defaultFolderId);
    } else {
      $('folderId').value = localStorage.getItem('folderId') || '';
    }
    setStatus($('configStatus'), `API key: ${config.hasApiKey ? 'есть' : 'нет'} · folderId: ${config.hasFolderId ? 'есть' : 'нет'}`, config.hasApiKey ? 'ok' : 'err');
    $('presetSelect').innerHTML = (presets.presets || []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)} (${item.intents})</option>`).join('') || '<option value="">Нет preset</option>';
  } catch (error) {
    setStatus($('configStatus'), error.message, 'err');
  }
}

$('folderId').addEventListener('change', () => localStorage.setItem('folderId', $('folderId').value.trim()));
$('regionSearch').addEventListener('input', renderRegions);

$('testBtn').onclick = async () => {
  setStatus($('configStatus'), 'Проверяю…');
  try {
    const data = await api('/api/test', { method: 'POST', body: JSON.stringify({ folderId: $('folderId').value.trim() }) });
    setStatus($('configStatus'), `Доступ есть · корневых регионов: ${data.regionRoots}`, 'ok');
  } catch (error) {
    setStatus($('configStatus'), error.message, 'err');
  }
};

$('regionsBtn').onclick = async () => {
  setStatus($('runStatus'), 'Загружаю дерево регионов…');
  try {
    const data = await api('/api/regions', { method: 'POST', body: JSON.stringify({ folderId: $('folderId').value.trim() }) });
    allRegions = data.regions || [];
    $('regionSearch').value = 'Омск';
    renderRegions();
    setStatus($('runStatus'), `Загружено регионов: ${allRegions.length}. Отфильтровано по «Омск».`, 'ok');
  } catch (error) {
    setStatus($('runStatus'), error.message, 'err');
  }
};

$('runBtn').onclick = async () => {
  const seeds = $('seeds').value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const regions = selectedRegions();
  setStatus($('runStatus'), `Запуск: ${seeds.length} seed × ${regions.length} регион(а/ов)…`);
  $('runBtn').disabled = true;
  try {
    const data = await api('/api/batch', {
      method: 'POST',
      body: JSON.stringify({
        folderId: $('folderId').value.trim(),
        seeds,
        regions,
        numPhrases: Number($('numPhrases').value),
        device: $('device').value,
        useCache: $('useCache').checked,
      }),
    });
    lastRows = data.rows || [];
    lastAnalysis = null;
    renderRaw(data);
    $('csvBtn').disabled = !lastRows.length;
    $('analyzeBtn').disabled = !lastRows.length;
    $('intentCsvBtn').disabled = true;
    $('queryCsvBtn').disabled = true;
    setStatus($('runStatus'), `Готово: ${data.meta.rows} уникальных фраз.`, 'ok');
    setStatus($('analysisStatus'), 'Данные готовы к анализу.');
  } catch (error) {
    setStatus($('runStatus'), error.message, 'err');
  } finally {
    $('runBtn').disabled = false;
  }
};

$('csvBtn').onclick = () => downloadCsv(
  `wordstat-${new Date().toISOString().slice(0, 10)}.csv`,
  ['phrase', 'region_id', 'region_name', 'count', 'types', 'seeds'],
  lastRows.map((row) => [row.phrase, row.regionId, row.regionName, row.count, (row.types || []).join('|'), (row.seeds || []).join('|')]),
);

$('analyzeBtn').onclick = async () => {
  if (!lastRows.length) return;
  $('analyzeBtn').disabled = true;
  setStatus($('analysisStatus'), 'Классифицирую спрос и строю очередь действий…');
  try {
    const data = await api('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        rows: lastRows,
        presetId: $('presetSelect').value || 'silalesa',
        options: {
          includeTop: $('includeTop').checked,
          includeAssociations: $('includeAssociations').checked,
          minCount: Number($('minCount').value || 0),
          associationMinScore: Number($('associationScore').value),
        },
      }),
    });
    lastAnalysis = data;
    renderAnalysis(data);
    setStatus($('analysisStatus'), `Готово: Commercial ${data.meta.queryTypeCounts?.commercial || 0}, Informational ${data.meta.queryTypeCounts?.informational || 0}, Unmapped ${data.meta.queryTypeCounts?.unmapped || 0}.`, 'ok');
  } catch (error) {
    setStatus($('analysisStatus'), error.message, 'err');
  } finally {
    $('analyzeBtn').disabled = false;
  }
};

$('intentCsvBtn').onclick = () => {
  const rows = (lastAnalysis?.summary || []).filter((item) => item.phraseCount > 0);
  downloadCsv(
    `intent-map-${new Date().toISOString().slice(0, 10)}.csv`,
    ['intent_id', 'intent_title', 'cluster', 'region_id', 'region_name', 'business_priority', 'relative_demand_band', 'relative_rank', 'phrase_count', 'max_count', 'strongest_phrase', 'dominant_query_type', 'next_action', 'commercial_phrases', 'informational_phrases', 'unmapped_phrases'],
    rows.map((item) => [
      item.intentId, item.intentTitle, item.cluster, item.regionId, item.regionName, item.businessPriority,
      item.relativeDemandBand, item.relativeRank ?? '', item.phraseCount, item.maxCount, item.strongestPhrase,
      item.dominantQueryType, item.nextAction,
      item.queryTypeCounts?.commercial || 0, item.queryTypeCounts?.informational || 0, item.queryTypeCounts?.unmapped || 0,
    ]),
  );
};

$('queryCsvBtn').onclick = () => {
  const rows = lastAnalysis?.classifiedRows || [];
  downloadCsv(
    `query-actions-${new Date().toISOString().slice(0, 10)}.csv`,
    ['phrase', 'region_id', 'region_name', 'count', 'types', 'seeds', 'analysis_status', 'query_type', 'query_confidence', 'query_source', 'next_action', 'intent_id', 'intent_title', 'intent_score', 'matched_keywords'],
    rows.map((row) => [
      row.phrase, row.regionId, row.regionName, row.count, (row.types || []).join('|'), (row.seeds || []).join('|'),
      row.analysisStatus, row.queryType, row.queryConfidence, row.querySource, row.nextAction,
      row.intentId || '', row.intentTitle || '', row.score || '', (row.matchedKeywords || []).join('|'),
    ]),
  );
};

init();
