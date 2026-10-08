(() => {
  'use strict';
  const table = document.getElementById('observations');
  if (!table) return;
  const body = table.tBodies[0];
  const rows = [...body.rows];
  const search = document.getElementById('search');
  const kind = document.getElementById('kind');
  const decision = document.getElementById('decision');
  const remaining = document.getElementById('remaining');
  const sort = document.getElementById('sort');
  let descending = true;

  function filter() {
    const term = search.value.trim().toLocaleLowerCase('ru-RU');
    let visible = 0;
    for (const row of rows) {
      const show = (!term || row.textContent.toLocaleLowerCase('ru-RU').includes(term)) &&
        (kind.value === 'all' || row.dataset.kind === kind.value) &&
        (decision.value === 'all' || row.dataset.decision === decision.value);
      row.hidden = !show;
      if (show) visible++;
    }
    remaining.textContent = 'Показано: ' + visible + ' из ' + rows.length + ' наблюдений';
  }

  search.addEventListener('input', filter);
  kind.addEventListener('change', filter);
  decision.addEventListener('change', filter);
  sort.addEventListener('click', () => {
    const sorted = [...rows].sort((a, b) => {
      const difference = Number(a.dataset.count) - Number(b.dataset.count);
      return descending ? -difference : difference;
    });
    body.replaceChildren(...sorted);
    descending = !descending;
    sort.textContent = descending ? 'Частотность ↓' : 'Частотность ↑';
    sort.setAttribute('aria-label', 'Изменить направление сортировки по частотности');
  });

  document.getElementById('export').addEventListener('click', () => {
    const visible = [...body.rows].filter(row => !row.hidden);
    const cells = [['Источник','Запрос','Фрагмент','Решение модели','Частотность','Требует пересмотра','URL']];
    for (const row of visible) {
      const td = row.cells;
      const source = td[0].querySelector('.source-tag').textContent;
      const query = td[1].querySelector('strong').textContent;
      const excerpt = td[1].querySelector('p').textContent;
      const anchor = td[1].querySelector('a[href^="http"]');
      cells.push([
        source, query, excerpt, td[2].querySelector('.status-pill').textContent,
        row.dataset.count === '-1' ? '' : row.dataset.count,
        row.dataset.review === 'yes' ? 'Да' : 'Нет', anchor?.href || '',
      ]);
    }
    // Untrusted source text must not become spreadsheet formulas when CSV is opened.
    const safeCsv = value => {
      const text = String(value);
      const neutral = /^[\s]*[=+@-]/u.test(text) ? "'" + text : text;
      return '"' + neutral.replace(/"/g, '""') + '"';
    };
    const csv = '\ufeff' + cells.map(line => line.map(safeCsv).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'yaai-evidence-filtered.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoke after the click event has scheduled the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();