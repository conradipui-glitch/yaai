const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[c]));
const num = n => n == null ? 'нет данных' : Number(n).toLocaleString('ru-RU');
const pct = n => typeof n === 'number' && Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : 'нет данных';
const usd = n => n == null ? 'неизвестна' : '$' + n.toLocaleString('en-US', {maximumFractionDigits:8});
function dateLabel(value) {
  if (!value) return 'не указана';
  const stamp = new Date(value);
  return Number.isNaN(stamp.getTime()) ? h(value) : h(stamp.toLocaleString('ru-RU', {
    dateStyle:'medium', timeStyle:'short', timeZone:'UTC',
  }) + ' UTC');
}
function safeLink(url, label) {
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) return h(label || url || 'нет ссылки');
  return `<a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(label || url)}</a>`;
}
const anchorId = id => 'e-' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
const sourceLabel = row => row.kind === 'wordstat_phrase' ? 'Wordstat' : 'Поиск';
function evidenceRow(row) {
  const state = row.accepted ? 'Гипотеза модели' : 'Не принято моделью';
  const url = row.url ? safeLink(row.url, 'Открыть источник ↗') : 'Поисковый запрос';
  return `<tr id="${h(anchorId(row.id))}"
      data-kind="${h(row.kind)}" data-decision="${row.accepted?'accepted':'rejected'}"
      data-review="${row.needsReview?'yes':'no'}" data-count="${row.observedCount ?? -1}">
    <td><span class="source-tag ${row.kind==='wordstat_phrase'?'w':'s'}">${sourceLabel(row)}</span>
      <div class="subtle small">${h(row.region || 'Регион не указан')}</div></td>
    <td class="evidence-main">
      <strong>${h(row.query)}</strong><p>${h(row.excerpt)}</p>
      <span class="subtle small">${url}</span>
      ${row.sourceRelevance?.decision === 'review'
        ? '<div class="subtle small">Источник требует проверки соответствия теме</div>' : ''}
      <div class="subtle tiny">ID: <code>${h(row.id)}</code></div></td>
    <td><span class="status-pill ${row.accepted?'amber':'muted'}">${state}</span>
      <div class="subtle small">${h(row.modelCategory || 'Категория не присвоена')}</div></td>
    <td>${num(row.observedCount)}
      <div class="subtle tiny">${row.observedCount === null ? 'значение неизвестно' : 'не суммировать'}</div></td>
    <td>${row.needsReview ? '<span class="status-pill amber">Требуется</span>' : '<span class="status-pill muted">Не отмечена</span>'}</td>
  </tr>`;
}
function cardHtml(claim, observations) {
  const examples = claim.examples.map(id=>observations.get(id)).filter(Boolean);
  return `<article class="claim" id="claim-${h(claim.id)}">
    <div class="claim-top"><span class="eyebrow">Гипотеза · ${h(claim.id)}</span>
      <span class="status-pill amber">Не подтверждена</span></div>
    <h3>${h(claim.title)}</h3><p>${h(claim.statement)}.
      <strong>Это не доказательство жалоб клиентов.</strong></p>
    <div class="claim-stats">
      <span><b>${num(claim.observedWordstatPhrases)}</b> запросов Wordstat</span>
      <span><b>${num(claim.distinctSerpPages)}</b> страниц выдачи</span>
      <span><b>${num(claim.needsHumanReview)}</b> требуют пересмотра</span>
    </div>
    <details><summary>Показать примеры источников ↗</summary>
      <ul class="examples">${examples.map(row => `<li>
        <a href="#${h(anchorId(row.id))}">${h(row.query)}</a>
        <span class="subtle">${h(row.excerpt.slice(0, 170))}${row.excerpt.length>170?'…':''}</span>
      </li>`).join('')}</ul>
    </details>
    <p class="next"><span>Следующая проверка</span> ${h(claim.nextAction)}</p>
  </article>`;
}
function qualityHtml(q) {
  if (!q) return `<div class="quality-empty"><span class="eyebrow">Ручная проверка</span>
    <h3>Достоверность ещё не измерена</h3>
    <p>Файл человеческой проверки не предоставлен. Высокая вероятность Jev
      не является проверкой точности. Используйте <code>pain:review</code> и <code>pain:quality</code>.</p>
  </div>`;
  const measured = q.status === 'provisional_human_benchmark';
  return `<div class="quality-empty">
    <span class="eyebrow">Ручная проверка · ${measured?'Предварительная':'Недостаточно разметки'}</span>
    <h3>${measured?'Предварительная оценка на размеченной выборке':'Качество модели ещё не определено'}</h3>
    <p>Размечено: <b>${num(q.sample.labeled)}</b> из ${num(q.sample.queued)};
      целевой минимум ${num(q.sample.target)}. ${h(q.note)}</p>
    ${measured ? `<div class="quality-metrics">
       <span><b>${pct(q.metrics.precision)}</b> Precision</span>
       <span><b>${pct(q.metrics.recall)}</b> Recall</span>
       <span><b>${pct(q.metrics.sourceSupportedCoverage)}</b> Поддержка источниками</span>
    </div>` : ''}
  </div>`;
}
function sourceSelectionHtml(audit) {
  if (!audit) return '';
  const labels = {
    'person-name-greetings':'Поздравления и личное имя',
    'person-name-address':'Обращение к человеку по имени',
    'person-surname':'Фамилия, не маркетинговые лиды',
    'roads-not-marketing-cost':'Дороги, не стоимость лидов',
  };
  return `<aside class="relevance-audit" aria-label="Проверка поискового шума">
    <div class="relevance-heading"><span class="eyebrow">Фильтр перед платными оценками</span>
      <strong>${num(audit.excludedCount)} исключено из ${num(audit.examined)} кандидатов Wordstat</strong></div>
    <p>Только однозначные несовпадения темы исключены автоматически;
      ${num(audit.reviewCount)} неоднозначных фраз оставлено на проверку.
      Исходные данные Wordstat не изменялись.</p>
    ${audit.excluded.length ? `<details><summary>Какие запросы исключены и почему</summary>
      <ul>${audit.excluded.map(row=>`<li>
        <strong>${h(row.phrase)}</strong><span>${h(labels[row.reason] || row.reason)}</span>
        <small>Наблюдённая частотность: ${num(row.observedCount)} (не суммируется)</small>
      </li>`).join('')}</ul></details>` : ''}
  </aside>`;
}

function serpSelectionHtml(audit) {
  if (!audit) return '';
  const labels = {
    'personal-name-greeting-result':'Поздравление человеку по имени',
    'literal-road-result':'Буквальное описание дорог',
    'person-surname-result':'Фамилия человека',
    'topic-not-explicit-in-excerpt':'Тема не указана явно во фрагменте',
  };
  return `<aside class="relevance-audit" aria-label="Проверка релевантности страниц">
    <div class="relevance-heading"><span class="eyebrow">Проверка страниц перед Jev</span>
    <strong>${num(audit.excludedCount)} исключено из ${num(audit.examined)} фрагментов выдачи</strong></div>
    <p>${num(audit.reviewCount)} неоднозначных фрагментов сохранено на проверку.
    Отсутствие прямого совпадения темы — не основание для удаления новых или необычных сигналов.
    Исходный файл поисковой выдачи не изменён.</p>
    ${audit.excluded.length ? `<details><summary>Показать исключённые страницы и причины</summary>
      <ul>${audit.excluded.map(row=>`<li><strong>${h(row.title || row.query)}</strong>
      <span>${h(labels[row.reason] || (row.reason.startsWith('off-topic-query-')
        ? 'Поисковый запрос не соответствует теме' : row.reason))}</span>
      <small>${safeLink(row.url, 'Открыть исходную страницу ↗')}</small></li>`).join('')}</ul>
    </details>` : ''}
    ${audit.review.length ? `<details><summary>Показать ${num(audit.reviewCount)} неоднозначных источников</summary>
      <ul>${audit.review.map(row=>`<li><strong>${h(row.query)}</strong>
      <span>${h(labels[row.reason] || row.reason)}</span>
      <small>${safeLink(row.url, 'Открыть для проверки ↗')}</small></li>`).join('')}</ul>
    </details>` : ''}
  </aside>`;
}

export function renderPainReportHtml(doc, {css, script} = {}) {
  if (doc?.source !== 'yaai-evidence-report' || doc.schemaVersion !== 1 ||
      doc.reportType !== 'pain-discovery' || !Array.isArray(doc.claims) ||
      !Array.isArray(doc.observations)) {
    throw Error('Expected validated YA AI Evidence Report v1.');
  }
  if (typeof css !== 'string' || typeof script !== 'string' || !css || !script ||
      /<\/style/i.test(css) || /<\/script/i.test(script)) {
    throw Error('Report needs safe bundled CSS and script assets.');
  }
  const byId = new Map(doc.observations.map(x=>[x.id,x]));
  const cards = doc.claims.map(x=>cardHtml(x, byId)).join('');
  const table = doc.observations.map(evidenceRow).join('');
  const guide = doc.provenance.sourceLimitations.map(x=>'<li>'+h(x)+'</li>').join('');
  const s = doc.summary;
  return `<!doctype html><html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${h(doc.topic)} — YA AI Evidence Report</title>
<style>${css}</style></head><body><div class="shell">
<header class="masthead">
 <a href="#top" class="brand">yaai <small>EVIDENCE / REPORT</small></a>
 <div class="masthead-right">LOCAL REPORT · SOURCES FIRST</div>
</header><main id="top">
<section class="hero" aria-labelledby="main-title">
 <div><span class="eyebrow">Обзор исследованных свидетельств / 01</span>
 <h1 id="main-title">${h(doc.topic)}</h1>
 <p>Карта потенциальных проблем аудитории. Здесь собраны <strong>гипотезы модели</strong>
 и оригинальные поисковые свидетельства. Выводы требуют проверки человеком.</p>
 <div class="date-line">Анализ: ${dateLabel(doc.dates.analysisAt)}
 · Wordstat: ${dateLabel(doc.dates.wordstatAt)} · Поиск: ${dateLabel(doc.dates.serpAt)}</div></div>
 <aside class="hero-aside"><span class="eyebrow">Главное ограничение</span>
 <strong>Сигнал ≠ доказанная боль</strong>
 <p>Запросы, фрагменты выдачи и оценки Jev сами по себе не подтверждают,
 что реальные покупатели жаловались или готовы платить.</p></aside>
</section>
<div class="metrics" aria-label="Итоги классификации">
 <div class="metric"><span class="value">${num(s.assessedObservations)}</span><span class="label">Изучено наблюдений</span></div>
 <div class="metric"><span class="value">${num(s.modelAccepted)}</span><span class="label">Принято моделью</span><small>${num(s.hypothesisCategories)} категории гипотез</small></div>
 <div class="metric"><span class="value">${num(s.modelRejected)}</span><span class="label">Отклонено моделью</span></div>
 <div class="metric"><span class="value">${num(s.modelReviewNeeded)}</span><span class="label">Принято, но требует пересмотра</span></div>
</div>
<div class="source-readiness" role="note">
  <span class="eyebrow">Проверка источников</span>
  <div class="mix">
    <span><b>${num(s.acceptedBySource.wordstat)}</b> из ${num(s.sourceBreakdown.wordstat)} наблюдений Wordstat приняты моделью</span>
    <span><b>${num(s.acceptedBySource.serp)}</b> из ${num(s.sourceBreakdown.serp)} поисковых фрагментов приняты моделью</span>
  </div>
  <p>${s.sourceBreakdown.wordstat > 0 && s.acceptedBySource.wordstat === 0
    ? 'В этой выборке Jev не принял ни одного наблюдения Wordstat. Проверьте запросы на совпадения значений слов и посторонние темы. Это не доказательство отсутствия спроса.'
    : 'Проверьте тематическое соответствие исходных запросов и контекст найденных фрагментов до принятия продуктовых решений.'}</p>
</div>
${sourceSelectionHtml(doc.sourceSelection)}
${serpSelectionHtml(doc.serpSourceSelection)}
<section id="findings"><div class="section-head">
 <div><span class="eyebrow">01 / Гипотезы</span><h2>Какие сигналы обнаружены</h2></div>
 <p>Карточки перепроверены по полному журналу наблюдений, включая отрицательные ответы модели.</p>
</div><div class="claims">${cards || '<div class="quality-empty"><strong>Принятых гипотез пока нет.</strong><p>Это не означает отсутствия потребностей. Изучите журнал свидетельств.</p></div>'}</div>
</section>
<section id="quality"><div class="section-head">
 <div><span class="eyebrow">02 / Надёжность</span><h2>Что проверено человеком</h2></div>
</div>${qualityHtml(doc.quality)}</section>
<section id="evidence"><div class="section-head">
 <div><span class="eyebrow">03 / Исходные данные</span><h2>Полный журнал свидетельств</h2></div>
 <p>Сохранены принятые и отвергнутые наблюдения. Ссылки ведут на исходные страницы, если URL присутствует.</p>
</div>
<div class="ledger"><div class="toolbar">
 <label for="search">Найти свидетельство</label>
 <input id="search" type="search" placeholder="Запрос, фрагмент или ID…" autocomplete="off">
 <label for="kind">Источник</label><select id="kind">
 <option value="all">Все</option><option value="wordstat_phrase">Wordstat</option>
 <option value="serp_snippet">Поиск</option></select>
 <label for="decision">Решение</label><select id="decision">
 <option value="all">Любое</option><option value="accepted">Принято моделью</option>
 <option value="rejected">Не принято</option></select>
 <button type="button" id="sort" aria-label="Изменить сортировку по частотности">Частотность ↓</button>
 <button type="button" id="export">CSV по фильтру ↗</button>
</div><p class="swipe-note">↔ На узком экране таблица листается вправо. Можно использовать фильтры выше.</p>
<div class="table-wrap"><table id="observations">
<thead><tr><th scope="col">Источник</th><th scope="col">Свидетельство</th>
<th scope="col">Решение Jev</th><th scope="col">Частотность</th><th scope="col">Пересмотр</th>
</tr></thead><tbody>${table}</tbody></table></div>
<div class="ledger-foot" role="status" aria-live="polite" id="remaining">
Показано: ${num(doc.observations.length)} из ${num(doc.observations.length)} наблюдений</div>
</div></section>
<section id="method"><div class="section-head">
 <div><span class="eyebrow">04 / Метод</span><h2>Как читать результаты</h2></div>
</div><div class="note-panel"><ul>${guide}</ul>
<p><strong>Стоимость оценки Jev:</strong> ${usd(s.jevCostUsd)}.
${s.jevCostUsd === null ? 'Часть стоимости неизвестна — это не нулевые расходы.' :
'Расходы Яндекс API и ручную проверку сюда не включали.'}</p>
<p>Wordstat-наблюдений: ${num(s.sourceBreakdown.wordstat)};
поисковых фрагментов: ${num(s.sourceBreakdown.serp)}.
Частотности запросов не суммируются.</p></div></section>
</main><footer class="footer">
<span>YA AI · Самостоятельный отчёт с исходными свидетельствами.</span>
<span>Evidence Report Schema v${doc.schemaVersion} · Без онлайн-зависимостей</span>
</footer></div>
<script>${script}</script></body></html>`;
}
