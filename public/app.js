import { buildPagePlan } from './page-planner.js';

const $ = (id) => document.getElementById(id);
let allRegions = [];
let lastRows = [];
let lastAnalysis = null;
let lastPagePlan = null;

const TYPE_LABEL = {
  commercial: 'Commercial',
  informational: 'Informational',
  unmapped: 'Unmapped',
  noise: 'Noise',
};

const ACTION_LABEL = {
  landing: 'Р В РІР‚СњР В Р’ВµР В Р’В»Р В Р’В°Р РЋРІР‚С™Р РЋР Р‰ landing',
  guide: 'Р В РІР‚СњР В Р’ВµР В Р’В»Р В Р’В°Р РЋРІР‚С™Р РЋР Р‰ guide',
  hold: 'Р В РЎСџР В РЎвЂўР В РЎвЂќР В Р’В° Р В Р вЂ¦Р В Р’Вµ Р В РўвЂР В Р’ВµР В Р’В»Р В Р’В°Р РЋРІР‚С™Р РЋР Р‰',
};

const PLAN_LABEL = {
  expand: 'EXPAND',
  create: 'CREATE',
  merge: 'MERGE',
  hold: 'HOLD',
};

const PRIORITY_LABEL = {
  now: 'Р В Р Р‹Р В Р’ВµР В РІвЂћвЂ“Р РЋРІР‚РЋР В Р’В°Р РЋР С“',
  next: 'Р В Р Р‹Р В Р’В»Р В Р’ВµР В РўвЂР В РЎвЂўР В РЎВ',
  later: 'Р В РЎСџР В РЎвЂўР В Р’В·Р В Р’В¶Р В Р’Вµ',
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
    ? items.map((region) => `<label class="region"><input type="checkbox" data-id="${esc(region.id)}" data-name="${esc(region.name)}"><span><b>${esc(region.name)}</b><br><span class="muted">${esc(region.path)} Р вЂ™Р’В· ID ${esc(region.id)}</span></span></label>`).join('')
    : '<div class="muted">Р В РЎСљР В РЎвЂР РЋРІР‚РЋР В Р’ВµР В РЎвЂ“Р В РЎвЂў Р В Р вЂ¦Р В Р’Вµ Р В Р вЂ¦Р В Р’В°Р В РІвЂћвЂ“Р В РўвЂР В Р’ВµР В Р вЂ¦Р В РЎвЂў.</div>';
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({ error: 'Р В РЎСљР В Р’ВµР В РЎвЂќР В РЎвЂўР РЋР вЂљР РЋР вЂљР В Р’ВµР В РЎвЂќР РЋРІР‚С™Р В Р вЂ¦Р РЋРІР‚в„–Р В РІвЂћвЂ“ Р В РЎвЂўР РЋРІР‚С™Р В Р вЂ Р В Р’ВµР РЋРІР‚С™ Р РЋР С“Р В Р’ВµР РЋР вЂљР В Р вЂ Р В Р’ВµР РЋР вЂљР В Р’В°' }));
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
    metric('Р В Р Р‹Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В РЎвЂќ', meta.rows),
    metric('API Р В Р вЂ Р РЋРІР‚в„–Р В Р’В·Р В РЎвЂўР В Р вЂ Р В РЎвЂўР В Р вЂ ', meta.apiCalls),
    metric('Р В Р’ВР В Р’В· Р В РЎвЂќР РЋР РЉР РЋРІвЂљВ¬Р В Р’В°', meta.cachedCalls),
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
    metric('Р В РЎСџР В РЎвЂўР В РўвЂР В РЎвЂўР РЋРІвЂљВ¬Р В Р’В»Р В РЎвЂў', meta.eligibleRows, 'Р В РЎвЂ”Р В РЎвЂўР РЋР С“Р В Р’В»Р В Р’Вµ Р РЋРІР‚С›Р В РЎвЂР В Р’В»Р РЋР Р‰Р РЋРІР‚С™Р РЋР вЂљР В Р’В°'),
    metric('Р В Р’В Р В Р’В°Р В Р’В·Р В Р’В»Р В РЎвЂўР В Р’В¶Р В Р’ВµР В Р вЂ¦Р В РЎвЂў', meta.assignedRows, 'Р В РЎвЂ”Р В РЎвЂў intent'),
    metric('Commercial', q.commercial || 0, `landing: ${a.landing || 0}`),
    metric('Informational', q.informational || 0, `guide: ${a.guide || 0}`),
    metric('Unmapped', q.unmapped || 0, 'Р В Р вЂ¦Р РЋРЎвЂњР В Р’В¶Р В Р вЂ¦Р В Р’В° Р В РЎвЂ”Р РЋР вЂљР В РЎвЂўР В Р вЂ Р В Р’ВµР РЋР вЂљР В РЎвЂќР В Р’В°'),
    metric('Noise', q.noise || 0, 'Р В РЎвЂўР РЋРІР‚С™Р РЋР С“Р В Р’ВµР РЋРІР‚РЋР В Р’ВµР В Р вЂ¦Р В РЎвЂў'),
  ].join('');

  const intentRows = (data.summary || []).filter((item) => item.phraseCount > 0);
  $('intentBody').innerHTML = intentRows.length ? intentRows.map((item) => `<tr>
    <td><b>${esc(item.intentId)}</b></td>
    <td><b>${esc(item.intentTitle)}</b><br><span class="muted">${esc(item.cluster)}</span></td>
    <td>${esc(item.regionName)}</td>
    <td>${esc(item.businessPriority || 'Р Р†Р вЂљРІР‚Сњ')}</td>
    <td>${pill(item.relativeDemandBand, item.relativeDemandBand)} #${item.relativeRank ?? 'Р Р†Р вЂљРІР‚Сњ'}<br><span class="muted">max ${Number(item.maxCount).toLocaleString('ru-RU')}</span></td>
    <td>${pill(TYPE_LABEL[item.dominantQueryType] || item.dominantQueryType, item.dominantQueryType)}</td>
    <td>${pill(ACTION_LABEL[item.nextAction] || item.nextAction, item.nextAction)}</td>
    <td>${esc(item.strongestPhrase)}${item.strongestPhrase ? ` Р Р†Р вЂљРІР‚Сњ <b>${Number(item.maxCount).toLocaleString('ru-RU')}</b>` : ''}</td>
  </tr>`).join('') : '<tr><td colspan="8" class="muted">Р В РЎСџР В РЎвЂўР В РўвЂР РЋРІР‚В¦Р В РЎвЂўР В РўвЂР РЋР РЏР РЋРІР‚В°Р В РЎвЂР РЋРІР‚В¦ intent-Р В РЎвЂќР В Р’В»Р В Р’В°Р РЋР С“Р РЋРІР‚С™Р В Р’ВµР РЋР вЂљР В РЎвЂўР В Р вЂ  Р В Р вЂ¦Р В Р’Вµ Р В Р вЂ¦Р В Р’В°Р В РІвЂћвЂ“Р В РўвЂР В Р’ВµР В Р вЂ¦Р В РЎвЂў.</td></tr>';

  const classified = data.classifiedRows || [];
  $('actionBody').innerHTML = classified.slice(0, 1000).map((row) => `<tr>
    <td><b>${esc(row.phrase)}</b><br><span class="muted">${esc(row.analysisStatus || '')}</span></td>
    <td>${esc(row.regionName)}</td>
    <td>${Number(row.count || 0).toLocaleString('ru-RU')}</td>
    <td>${pill(TYPE_LABEL[row.queryType] || row.queryType, row.queryType)}</td>
    <td>${row.intentId ? `<b>${esc(row.intentId)}</b> Р вЂ™Р’В· ${esc(row.intentTitle)}` : '<span class="muted">Р В Р вЂ¦Р В Р’Вµ Р В РЎвЂ”Р РЋР вЂљР В РЎвЂР В Р вЂ Р РЋР РЏР В Р’В·Р В Р’В°Р В Р вЂ¦</span>'}</td>
    <td>${pill(ACTION_LABEL[row.nextAction] || row.nextAction, row.nextAction)}</td>
    <td>${esc(row.queryConfidence || 'Р Р†Р вЂљРІР‚Сњ')}<br><span class="muted">${esc(row.querySource || '')}</span></td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">Р В РЎСљР В Р’ВµР РЋРІР‚С™ Р В РЎвЂќР В Р’В»Р В Р’В°Р РЋР С“Р РЋР С“Р В РЎвЂР РЋРІР‚С›Р В РЎвЂР РЋРІР‚В Р В РЎвЂР РЋР вЂљР В РЎвЂўР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В Р вЂ¦Р РЋРІР‚в„–Р РЋРІР‚В¦ Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В РЎвЂќ.</td></tr>';

  $('intentCsvBtn').disabled = !intentRows.length;
  $('queryCsvBtn').disabled = !classified.length;
}

function renderPagePlan(data) {
  const counts = data.meta.decisionCounts || {};
  $('pagePlanMetrics').innerHTML = [
    metric('Р В Р Р‹Р РЋРІР‚С™Р РЋР вЂљР В Р’В°Р В Р вЂ¦Р В РЎвЂР РЋРІР‚В  Р В Р вЂ  Р В РЎвЂ”Р В Р’В»Р В Р’В°Р В Р вЂ¦Р В Р’Вµ', data.meta.pageCandidates || 0),
    metric('Р В Р Р‹Р В Р’ВµР В РІвЂћвЂ“Р РЋРІР‚РЋР В Р’В°Р РЋР С“', data.meta.nowCount || 0),
    metric('EXPAND', counts.expand || 0, 'Р РЋРЎвЂњР РЋР С“Р В РЎвЂР В Р’В»Р В РЎвЂР РЋРІР‚С™Р РЋР Р‰ Р РЋР С“Р РЋРЎвЂњР РЋРІР‚В°Р В Р’ВµР РЋР С“Р РЋРІР‚С™Р В Р вЂ Р РЋРЎвЂњР РЋР вЂ№Р РЋРІР‚В°Р РЋРЎвЂњР РЋР вЂ№'),
    metric('CREATE', counts.create || 0, 'Р РЋР С“Р В РЎвЂўР В Р’В·Р В РўвЂР В Р’В°Р РЋРІР‚С™Р РЋР Р‰ Р В Р вЂ¦Р В РЎвЂўР В Р вЂ Р РЋРЎвЂњР РЋР вЂ№'),
    metric('MERGE', counts.merge || 0, 'Р В Р вЂ Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В РЎвЂР РЋРІР‚С™Р РЋР Р‰ Р В Р вЂ  Р РЋР С“Р РЋРЎвЂњР РЋРІР‚В°Р В Р’ВµР РЋР С“Р РЋРІР‚С™Р В Р вЂ Р РЋРЎвЂњР РЋР вЂ№Р РЋРІР‚В°Р РЋРЎвЂњР РЋР вЂ№'),
    metric('HOLD', counts.hold || 0, 'Р В Р вЂ¦Р В Р’Вµ Р В РЎвЂ”Р РЋРЎвЂњР В Р’В±Р В Р’В»Р В РЎвЂР В РЎвЂќР В РЎвЂўР В Р вЂ Р В Р’В°Р РЋРІР‚С™Р РЋР Р‰ Р В РЎвЂ”Р В РЎвЂўР В РЎвЂќР В Р’В°'),
  ].join('');

  const pages = data.pages || [];
  $('pagePlanBody').innerHTML = pages.length ? pages.map((page) => {
    const regions = (page.regions || []).map((region) => `${region.regionName}: ${Number(region.maxCount || 0).toLocaleString('ru-RU')}`).join('<br>');
    const top = (page.topQueries || []).slice(0, 4).map((q) => `${esc(q.phrase)} <b>${Number(q.count || 0).toLocaleString('ru-RU')}</b>`).join('<br>');
    return `<tr>
      <td><b>#${page.priorityRank}</b><br>${pill(PRIORITY_LABEL[page.priorityBand] || page.priorityBand, page.priorityBand)}</td>
      <td>${pill(PLAN_LABEL[page.decision] || page.decision, page.decision)}<br><span class="muted">${esc(page.pageKind)}</span></td>
      <td><b>${esc(page.title)}</b><br><code>${esc(page.path)}</code>${page.generated ? '<br><span class="muted">auto target</span>' : ''}</td>
      <td>${esc(page.businessPriority || 'Р Р†Р вЂљРІР‚Сњ')}<br><span class="muted">score ${esc(page.plannerScore)}</span></td>
      <td><b>${esc(page.strongestPhrase)}</b> Р Р†Р вЂљРІР‚Сњ ${Number(page.maxCount || 0).toLocaleString('ru-RU')}<br><span class="muted">${esc(page.strongestRegion)}</span></td>
      <td>${regions || 'Р Р†Р вЂљРІР‚Сњ'}</td>
      <td>${(page.intentIds || []).map((id) => pill(id)).join('') || '<span class="muted">Р В Р’В±Р В Р’ВµР В Р’В· intent</span>'}</td>
      <td>${top || 'Р Р†Р вЂљРІР‚Сњ'}${page.note ? `<br><span class="muted">${esc(page.note)}</span>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="muted">Page Planner Р В Р вЂ¦Р В Р’Вµ Р В Р вЂ¦Р В Р’В°Р РЋРІвЂљВ¬Р РЋРІР‚ВР В Р’В» Р В РЎвЂќР В Р’В°Р В Р вЂ¦Р В РўвЂР В РЎвЂР В РўвЂР В Р’В°Р РЋРІР‚С™Р В РЎвЂўР В Р вЂ .</td></tr>';

  $('pagePlanCsvBtn').disabled = !pages.length;
  setStatus($('pagePlanStatus'), `Р В РІР‚СљР В РЎвЂўР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р В РЎвЂў: ${pages.length} Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В Р’В°Р В Р вЂ¦Р В РЎвЂР РЋРІР‚В -Р В РЎвЂќР В Р’В°Р В Р вЂ¦Р В РўвЂР В РЎвЂР В РўвЂР В Р’В°Р РЋРІР‚С™Р В РЎвЂўР В Р вЂ ; ${counts.hold || 0} Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В РЎвЂќ Р В РЎвЂўР РЋР С“Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦Р РЋРІР‚в„– Р В Р вЂ  HOLD.`, 'ok');
}

async function buildPlannerFromAnalysis() {
  if (!lastAnalysis) return;
  const presetId = $('presetSelect').value;
  if (!presetId) throw new Error('Choose a preset first.');
  let plannerProfile = {};
  try {
    plannerProfile = (await api(`/api/planner?id=${encodeURIComponent(presetId)}`)).planner || {};
  } catch {
    plannerProfile = {};
  }
  lastPagePlan = buildPagePlan(lastAnalysis, { id: presetId, pagePlanner: plannerProfile });
  renderPagePlan(lastPagePlan);
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
    setStatus($('configStatus'), `API key: ${config.hasApiKey ? 'Р В Р’ВµР РЋР С“Р РЋРІР‚С™Р РЋР Р‰' : 'Р В Р вЂ¦Р В Р’ВµР РЋРІР‚С™'} Р вЂ™Р’В· folderId: ${config.hasFolderId ? 'Р В Р’ВµР РЋР С“Р РЋРІР‚С™Р РЋР Р‰' : 'Р В Р вЂ¦Р В Р’ВµР РЋРІР‚С™'}`, config.hasApiKey ? 'ok' : 'err');
    $('presetSelect').innerHTML = (presets.presets || []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)} (${item.intents})</option>`).join('') || '<option value="">Р В РЎСљР В Р’ВµР РЋРІР‚С™ preset</option>';
  } catch (error) {
    setStatus($('configStatus'), error.message, 'err');
  }
}

$('folderId').addEventListener('change', () => localStorage.setItem('folderId', $('folderId').value.trim()));
$('regionSearch').addEventListener('input', renderRegions);

$('testBtn').onclick = async () => {
  setStatus($('configStatus'), 'Р В РЎСџР РЋР вЂљР В РЎвЂўР В Р вЂ Р В Р’ВµР РЋР вЂљР РЋР РЏР РЋР вЂ№Р Р†Р вЂљР’В¦');
  try {
    const data = await api('/api/test', { method: 'POST', body: JSON.stringify({ folderId: $('folderId').value.trim() }) });
    setStatus($('configStatus'), `Р В РІР‚СњР В РЎвЂўР РЋР С“Р РЋРІР‚С™Р РЋРЎвЂњР В РЎвЂ” Р В Р’ВµР РЋР С“Р РЋРІР‚С™Р РЋР Р‰ Р вЂ™Р’В· Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р вЂ¦Р В Р’ВµР В Р вЂ Р РЋРІР‚в„–Р РЋРІР‚В¦ Р РЋР вЂљР В Р’ВµР В РЎвЂ“Р В РЎвЂР В РЎвЂўР В Р вЂ¦Р В РЎвЂўР В Р вЂ : ${data.regionRoots}`, 'ok');
  } catch (error) {
    setStatus($('configStatus'), error.message, 'err');
  }
};

$('regionsBtn').onclick = async () => {
  setStatus($('runStatus'), 'Р В РІР‚вЂќР В Р’В°Р В РЎвЂ“Р РЋР вЂљР РЋРЎвЂњР В Р’В¶Р В Р’В°Р РЋР вЂ№ Р В РўвЂР В Р’ВµР РЋР вЂљР В Р’ВµР В Р вЂ Р В РЎвЂў Р РЋР вЂљР В Р’ВµР В РЎвЂ“Р В РЎвЂР В РЎвЂўР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р Р†Р вЂљР’В¦');
  try {
    const data = await api('/api/regions', { method: 'POST', body: JSON.stringify({ folderId: $('folderId').value.trim() }) });
    allRegions = data.regions || [];
    $('regionSearch').value = 'Р В РЎвЂєР В РЎВР РЋР С“Р В РЎвЂќ';
    renderRegions();
    setStatus($('runStatus'), `Р В РІР‚вЂќР В Р’В°Р В РЎвЂ“Р РЋР вЂљР РЋРЎвЂњР В Р’В¶Р В Р’ВµР В Р вЂ¦Р В РЎвЂў Р РЋР вЂљР В Р’ВµР В РЎвЂ“Р В РЎвЂР В РЎвЂўР В Р вЂ¦Р В РЎвЂўР В Р вЂ : ${allRegions.length}. Р В РЎвЂєР РЋРІР‚С™Р РЋРІР‚С›Р В РЎвЂР В Р’В»Р РЋР Р‰Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В РЎвЂў Р В РЎвЂ”Р В РЎвЂў Р вЂ™Р’В«Р В РЎвЂєР В РЎВР РЋР С“Р В РЎвЂќР вЂ™Р’В».`, 'ok');
  } catch (error) {
    setStatus($('runStatus'), error.message, 'err');
  }
};

$('runBtn').onclick = async () => {
  const seeds = $('seeds').value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const regions = selectedRegions();
  setStatus($('runStatus'), `Р В РІР‚вЂќР В Р’В°Р В РЎвЂ”Р РЋРЎвЂњР РЋР С“Р В РЎвЂќ: ${seeds.length} seed Р вЂњРІР‚вЂќ ${regions.length} Р РЋР вЂљР В Р’ВµР В РЎвЂ“Р В РЎвЂР В РЎвЂўР В Р вЂ¦(Р В Р’В°/Р В РЎвЂўР В Р вЂ )Р Р†Р вЂљР’В¦`);
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
    lastPagePlan = null;
    renderRaw(data);
    $('csvBtn').disabled = !lastRows.length;
    $('analyzeBtn').disabled = !lastRows.length;
    $('intentCsvBtn').disabled = true;
    $('queryCsvBtn').disabled = true;
    $('pagePlanCsvBtn').disabled = true;
    $('pagePlanMetrics').innerHTML = '';
    $('pagePlanBody').innerHTML = '<tr><td colspan="8" class="muted">Р В Р Р‹Р В Р вЂ¦Р В Р’В°Р РЋРІР‚РЋР В Р’В°Р В Р’В»Р В Р’В° Р В РЎвЂ”Р В РЎвЂўР РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР В РІвЂћвЂ“Р РЋРІР‚С™Р В Р’Вµ Р В РЎвЂќР В Р’В°Р РЋР вЂљР РЋРІР‚С™Р РЋРЎвЂњ Р В РўвЂР В Р’ВµР В РІвЂћвЂ“Р РЋР С“Р РЋРІР‚С™Р В Р вЂ Р В РЎвЂР В РІвЂћвЂ“.</td></tr>';
    setStatus($('pagePlanStatus'), 'Page Planner Р В Р’В¶Р В РўвЂР РЋРІР‚ВР РЋРІР‚С™ Р В Р’В°Р В Р вЂ¦Р В Р’В°Р В Р’В»Р В РЎвЂР В Р’В·Р В Р’В°.');
    setStatus($('runStatus'), `Р В РІР‚СљР В РЎвЂўР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р В РЎвЂў: ${data.meta.rows} Р РЋРЎвЂњР В Р вЂ¦Р В РЎвЂР В РЎвЂќР В Р’В°Р В Р’В»Р РЋР Р‰Р В Р вЂ¦Р РЋРІР‚в„–Р РЋРІР‚В¦ Р РЋРІР‚С›Р РЋР вЂљР В Р’В°Р В Р’В·.`, 'ok');
    setStatus($('analysisStatus'), 'Р В РІР‚СњР В Р’В°Р В Р вЂ¦Р В Р вЂ¦Р РЋРІР‚в„–Р В Р’Вµ Р В РЎвЂ“Р В РЎвЂўР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р РЋРІР‚в„– Р В РЎвЂќ Р В Р’В°Р В Р вЂ¦Р В Р’В°Р В Р’В»Р В РЎвЂР В Р’В·Р РЋРЎвЂњ.');
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
  setStatus($('analysisStatus'), 'Р В РЎв„ўР В Р’В»Р В Р’В°Р РЋР С“Р РЋР С“Р В РЎвЂР РЋРІР‚С›Р В РЎвЂР РЋРІР‚В Р В РЎвЂР РЋР вЂљР РЋРЎвЂњР РЋР вЂ№ Р РЋР С“Р В РЎвЂ”Р РЋР вЂљР В РЎвЂўР РЋР С“ Р В РЎвЂ Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В РЎвЂўР РЋР вЂ№ Р В РЎвЂўР РЋРІР‚РЋР В Р’ВµР РЋР вЂљР В Р’ВµР В РўвЂР РЋР Р‰ Р В РўвЂР В Р’ВµР В РІвЂћвЂ“Р РЋР С“Р РЋРІР‚С™Р В Р вЂ Р В РЎвЂР В РІвЂћвЂ“Р Р†Р вЂљР’В¦');
  setStatus($('pagePlanStatus'), 'Р В РЎСџР В РЎвЂўР РЋР С“Р В Р’В»Р В Р’Вµ intent-Р В РЎвЂќР В Р’В°Р РЋР вЂљР РЋРІР‚С™Р РЋРІР‚в„– Р В Р’В°Р В Р вЂ Р РЋРІР‚С™Р В РЎвЂўР В РЎВР В Р’В°Р РЋРІР‚С™Р В РЎвЂР РЋРІР‚РЋР В Р’ВµР РЋР С“Р В РЎвЂќР В РЎвЂ Р РЋР С“Р В РЎвЂўР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРЎвЂњ Р В РЎвЂ”Р В Р’В»Р В Р’В°Р В Р вЂ¦ Р РЋР С“Р РЋРІР‚С™Р РЋР вЂљР В Р’В°Р В Р вЂ¦Р В РЎвЂР РЋРІР‚В Р Р†Р вЂљР’В¦');
  try {
    const data = await api('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        rows: lastRows,
        presetId: $('presetSelect').value,
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
    setStatus($('analysisStatus'), `Р В РІР‚СљР В РЎвЂўР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р В РЎвЂў: Commercial ${data.meta.queryTypeCounts?.commercial || 0}, Informational ${data.meta.queryTypeCounts?.informational || 0}, Unmapped ${data.meta.queryTypeCounts?.unmapped || 0}.`, 'ok');
    await buildPlannerFromAnalysis();
  } catch (error) {
    setStatus($('analysisStatus'), error.message, 'err');
    setStatus($('pagePlanStatus'), 'Page Planner Р В Р вЂ¦Р В Р’Вµ Р В Р’В·Р В Р’В°Р В РЎвЂ”Р РЋРЎвЂњР РЋРІР‚В°Р В Р’ВµР В Р вЂ¦ Р В РЎвЂР В Р’В·-Р В Р’В·Р В Р’В° Р В РЎвЂўР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В РЎвЂ Р В Р’В°Р В Р вЂ¦Р В Р’В°Р В Р’В»Р В РЎвЂР В Р’В·Р В Р’В°.', 'err');
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

$('pagePlanCsvBtn').onclick = () => {
  const pages = lastPagePlan?.pages || [];
  downloadCsv(
    `page-plan-${new Date().toISOString().slice(0, 10)}.csv`,
    ['rank', 'priority_band', 'decision', 'page_kind', 'title', 'path', 'business_priority', 'planner_score', 'phrase_count', 'max_count', 'strongest_phrase', 'strongest_region', 'regions', 'intent_ids', 'top_queries', 'note'],
    pages.map((page) => [
      page.priorityRank, page.priorityBand, page.decision, page.pageKind, page.title, page.path,
      page.businessPriority, page.plannerScore, page.phraseCount, page.maxCount, page.strongestPhrase, page.strongestRegion,
      (page.regions || []).map((r) => `${r.regionName}:${r.maxCount}`).join('|'),
      (page.intentIds || []).join('|'),
      (page.topQueries || []).map((q) => `${q.phrase}:${q.count}`).join('|'),
      page.note || '',
    ]),
  );
};

init();
