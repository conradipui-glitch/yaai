// Read-only Evidence Report v1 presentation. Text is inserted using textContent,
 // never as HTML. A displayed source fragment is not a verified customer review.
const $ = id => document.getElementById(id);
const node = (tag, className = '', text = '') => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
};
let current = null;
let selectedId = null;

function setState(text, loaded = false) {
  const state = $('pain-state');
  state.textContent = text;
  state.classList.toggle('report-ready', loaded);
}
function clear() {
  current = null;
  selectedId = null;
  $('pain-stats').hidden = true;
  $('pain-map-badge').textContent = 'НЕТ ДАННЫХ';
  $('pain-center-title').textContent = 'Гипотезы о проблемах';
  $('pain-center-note').textContent = 'Ожидаем отчёт';
  $('pain-map-empty').hidden = false;
  $('pain-links').replaceChildren();
  $('pain-map').querySelectorAll('.live-topic').forEach(element => element.remove());
  $('pain-evidence').replaceChildren(node('div', 'empty big-empty', 'Ожидаем сохранённые источники выбранного проекта.'));
  $('pain-claims').replaceChildren(node('div', 'empty big-empty', 'Сохранённые гипотезы ещё не подключены.'));
  $('topic-title').textContent = 'Выберите категорию';
  $('topic-description').textContent = 'Сначала подключите сохранённый Evidence Report v1.';
  $('pain-details-foot').textContent = 'Нет выбранной категории';
}

function stateLabel(quality) {
  if (quality === 'provisional_human_benchmark') return 'Есть предварительная ручная оценка выборки; это не подтверждение гипотез о всём рынке.';
  if (quality === 'insufficient_manual_labels') return 'Ручных меток недостаточно для оценки качества модели.';
  return 'Ручная оценка не приложена. Все категории остаются гипотезами.';
}
function sourceLink(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const link = new URL(url);
    if (!['http:','https:'].includes(link.protocol) || !link.hostname || link.username || link.password) return null;
    const a = node('a', 'source-link', 'Открыть исходную страницу ↗');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  } catch { return null; }
}
function evidenceCard(row) {
  const card = node('div', 'source-card');
  const header = node('div', 'source-head');
  const type = node('span', 'source-kind', row.kind === 'serp_snippet' ? 'Фрагмент SERP' : 'Поисковая фраза Wordstat');
  header.append(type, node('span','source-review', row.needsReview ? 'Отмечено для пересмотра' : 'Нет флага пересмотра'));
  card.append(header);
  card.append(node('p', 'source-quote', '«' + row.excerpt + '»'));
  const context = [row.query ? 'Запрос: ' + row.query : null, row.region ? 'Регион: ' + row.region : null]
    .filter(Boolean).join(' · ');
  if (context) card.append(node('small','source-context',context));
  if (row.kind === 'wordstat_phrase') {
    card.append(node('small', 'source-context', row.observedCount == null
      ? 'Частотность не предоставлена; URL отсутствует'
      : 'Наблюдённая частотность одной фразы: ' + row.observedCount.toLocaleString('ru-RU') +
        '. Не количество жалоб или покупателей.'));
  } else {
    card.append(node('small', 'source-context', 'Только фрагмент поисковой выдачи; контекст полной страницы не проверен.'));
    const link = sourceLink(row.url);
    if (link) card.append(link);
  }
  return card;
}

function selectClaim(id) {
  if (!current) return;
  const claim = current.claims.find(item => item.id === id);
  if (!claim) return;
  selectedId = id;
  for (const item of document.querySelectorAll('.live-topic,[data-claim-id]')) {
    const isCurrent = item.dataset.claimId === id;
    item.classList.toggle('selected', isCurrent);
    if (isCurrent) item.setAttribute('aria-pressed','true');
    else item.setAttribute('aria-pressed','false');
  }
  $('topic-title').textContent = claim.title;
  $('topic-description').textContent = 'Это категория, предложенная на основе обработки источников. Пока она имеет статус гипотезы и не означает подтверждённую проблему покупателей.';
  const foot = $('pain-details-foot');
  foot.replaceChildren();
  for (const [label, value] of [
    ['Наблюдений, отнесённых моделью:', claim.acceptedObservations],
    ['Фрагментов SERP:', claim.observedSerpSnippets],
    ['Разных веб-страниц:', claim.distinctSerpPages],
    ['Wordstat-фраз:', claim.observedWordstatPhrases],
    ['С флагом ручной проверки:', claim.needsHumanReview],
  ]) {
    const line = node('div','detail-item');
    line.append(node('span','',label), node('strong','',String(value)));
    foot.append(line);
  }
  if (claim.largestSinglePhraseCount != null) {
    const line = node('div','detail-item');
    line.append(node('span','','Максимум одной Wordstat-фразы:'),node('strong','',String(claim.largestSinglePhraseCount)));
    foot.append(line);
  }
  foot.append(node('small','detail-disclaimer','Частотности пересекаются, их нельзя суммировать. Вероятности модели не подтверждают достоверность.'));
  const selected = current.evidence.filter(item => item.category === id);
  const list = $('pain-evidence');
  list.replaceChildren();
  for (const observation of selected) list.append(evidenceCard(observation));
  if (!selected.length) list.append(node('div','empty','Связанные наблюдения не найдены.'));
}

function buildMap(claims) {
  const container = $('pain-map');
  const links = $('pain-links');
  container.querySelectorAll('.live-topic').forEach(element => element.remove());
  links.replaceChildren();
  $('pain-map-empty').hidden = Boolean(claims.length);
  $('pain-map-badge').textContent = claims.length ? 'ИЗ СОХРАНЁННОГО ОТЧЁТА' : 'НЕТ ГИПОТЕЗ';
  $('pain-center-note').textContent = claims.length
    ? claims.length + ' категор.' : 'Категорий нет';
  claims.forEach((claim, index) => {
    const left = index % 2 === 0;
    const level = Math.floor(index / 2);
    const button = node('button','topic live-topic');
    button.type = 'button';
    button.dataset.claimId = claim.id;
    button.style.gridColumn = left ? '1' : '3';
    button.style.gridRow = String(level + 1);
    const symbol = node('span','','✦');
    const title = node('strong','',claim.title);
    const count = node('small','',claim.acceptedObservations + ' наблюд.');
    button.append(symbol,title,count);
    button.addEventListener('click', () => selectClaim(claim.id));
    container.append(button);
    const endX = left ? 180 : 600;
    const endY = (level + .5) * 84;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', 'M390 210 Q' + (left ? 295 : 485) + ' ' + endY + ' ' + endX + ' ' + endY);
    links.append(path);
  });
}

function buildTable(claims) {
  const root = $('pain-claims');
  root.replaceChildren();
  if (!claims.length) {
    root.append(node('div','empty','В этом отчёте модель не отнесла наблюдения к категориям проблем. Это не означает отсутствия проблем на рынке.'));
    return;
  }
  const table = node('table','pain-table');
  const thead = document.createElement('thead');
  const headers = ['Категория-гипотеза','Наблюдения','Фрагменты SERP','Фразы Wordstat','Для пересмотра'];
  const tr = document.createElement('tr');
  for (const label of headers) tr.append(node('th','',label));
  thead.append(tr);
  const body = document.createElement('tbody');
  for (const claim of claims) {
    const row = document.createElement('tr');
    const cells = [claim.title, claim.acceptedObservations, claim.observedSerpSnippets,
      claim.observedWordstatPhrases, claim.needsHumanReview];
    for (let i=0; i<cells.length; i++) {
      const td = node('td','',String(cells[i]));
      if (i === 0) {
        const button = node('button','claim-button',String(cells[i]));
        button.type = 'button';
        button.dataset.claimId = claim.id;
        button.addEventListener('click', () => selectClaim(claim.id));
        td.replaceChildren(button);
      }
      row.append(td);
    }
    body.append(row);
  }
  table.append(thead,body);
  root.append(table);
}

export function renderPainReport(payload) {
  clear();
  if (!payload || payload.status !== 'ready' || !payload.report) {
    if (payload?.status === 'no_report') {
      setState('Для проекта «' + payload.caseId + '» ещё нет отчёта. Поместите проверенный JSON Evidence Report v1 в ' + payload.expectedRelativePath + '. Никаких платных запросов не выполняется.');
    } else {
      setState('Выберите проект, чтобы загрузить его сохранённый отчёт Pain Discovery.');
    }
    return;
  }
  const data = payload.report;
  current = data;
  $('pain-stats').hidden = false;
  $('pain-topic').textContent = data.topic;
  $('pain-claim-count').textContent = String(data.summary.hypothesisCategories);
  $('pain-observed-count').textContent = String(data.summary.assessedObservations);
  $('pain-review-count').textContent = String(data.summary.modelReviewNeeded);
  setState('Сохранённый отчёт загружен · ' + stateLabel(data.qualityStatus) +
    ' Принято моделью: ' + data.summary.modelAccepted + ', не принято: ' + data.summary.modelRejected +
    '. Принято ≠ подтверждено.', true);
  buildMap(data.claims);
  buildTable(data.claims);
  if (data.claims.length) selectClaim(data.claims[0].id);
  else {
    $('pain-evidence').replaceChildren(node('div','empty','Модель не выделила гипотез в сохранённой выборке.'));
  }
}
