const byId = id => document.getElementById(id);
const VIEWS = new Map([
  ['home', 'Обзор'],
  ['pain', 'Проблемы клиентов'],
  ['agent', 'ИИ-агент'],
  ['models', 'Модели и API'],
]);
const TOPICS = {
  booking: ['Запись и расписание', 'Здесь будут подтверждённые сложности с бронированием, календарём и пропущенными записями — со ссылками на конкретные источники.'],
  prices: ['Цены и выручка', 'Будущие цитаты о ценовой политике, подписках и измерении доходности. На данный момент источники не подключены.'],
  marketing: ['Маркетинг и рост', 'Будущие проблемы привлечения и удержания клиентов. Приоритет нельзя определить без реальных наблюдений.'],
  service: ['Клиентский опыт', 'Будущая группировка отзывов об обслуживании, обратной связи и повторных обращениях.'],
  team: ['Команда и процессы', 'Будущие затруднения с сотрудниками, адаптацией и ежедневными задачами.'],
  business: ['Управление бизнесом', 'Будущие вопросы операционного контроля и аналитики. Никаких выводов без проверенных данных.'],
};
const STATUSES = {
  draft: 'Черновик', result_linked: 'Связан с результатом',
  running: 'Выполняется локально', succeeded: 'Завершена',
  failed: 'Ошибка', interrupted: 'Прервана',
};
const KINDS = {research: 'Исследование', evaluation: 'Оценка', report: 'Отчёт', export: 'Экспорт'};

function showView(view) {
  if (!VIEWS.has(view)) view = 'home';
  for (const name of VIEWS.keys()) byId(name).hidden = name !== view;
  for (const btn of document.querySelectorAll('[data-view]')) {
    const active = btn.dataset.view === view;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  byId('crumb-current').textContent = VIEWS.get(view);
  history.replaceState(null, '', '#' + view);
}

async function fetchJson(url) {
  const response = await fetch(url, {headers:{accept:'application/json'}, cache:'no-store'});
  if (!response.ok) throw Error('Сервер вернул HTTP ' + response.status);
  return response.json();
}

function safePreference(name, fallback = '') {
  try { return localStorage.getItem(name) ?? fallback; } catch { return fallback; }
}
function savePreference(name, value) {
  try { localStorage.setItem(name, value); } catch { /* optional browser storage */ }
}

function status(value) {
  return STATUSES[value] || 'Статус: ' + String(value ?? 'неизвестен');
}
function resetMetrics() {
  for (const id of ['case-count','task-count','api-calls','wordstat-ready','has-api-key','has-folder','budget-stat']) byId(id).textContent = '—';
  byId('provider-pill').textContent = 'Не проверено';
}

function renderTasks(data) {
  const list = byId('task-list');
  list.replaceChildren();
  if (!data.activeCaseId) {
    const el = document.createElement('div');
    el.className = 'empty';
    el.textContent = 'Пока нет проектов. Создайте рабочее пространство через CLI setup — Studio покажет его здесь.';
    list.append(el); return;
  }
  if (!data.tasks?.length) {
    const el = document.createElement('div');
    el.className = 'empty';
    el.textContent = 'В этом проекте пока нет сохранённых задач. Задания создаются через CLI, а Studio показывает их состояние.';
    list.append(el); return;
  }
  for (const task of data.tasks) {
    const item = document.createElement('div');
    item.className = 'task';
    const icon = document.createElement('span');
    icon.className = 'task-icon'; icon.textContent = '▤';
    const details = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'task-name'; title.textContent = task.title;
    const meta = document.createElement('div'); meta.className = 'task-meta';
    const updated = Number.isFinite(Date.parse(task.updatedAt)) ? new Date(task.updatedAt).toLocaleString('ru-RU') : 'Без даты';
    meta.textContent = (KINDS[task.kind] || 'Задание') + ' · ' + updated;
    details.append(title, meta);
    const label = document.createElement('span'); label.className = 'task-status'; label.textContent = status(task.status);
    item.append(icon, details, label);
    list.append(item);
  }
  if (data.tasksOmitted > 0) {
    const extra = document.createElement('p');
    extra.className = 'supporting';
    extra.textContent = 'Показаны последние 40 задач. Ещё: ' + data.tasksOmitted;
    list.append(extra);
  }
}

let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const refreshButton = byId('refresh');
  refreshButton.disabled = true;
  byId('error').hidden = true;
  byId('server-state').textContent = 'Обновление…';
  byId('server-state').classList.remove('error');
  try {
    const [config, list] = await Promise.all([
      fetchJson('/api/config'),
      fetchJson('/api/studio/overview'),
    ]);
    if (!Array.isArray(list.cases)) throw Error('Неверный ответ локального сервера');
    const select = byId('case-select');
    const previous = select.dataset.selected || safePreference('yaai-studio-case');
    const chosen = list.cases.some(item => item.id === previous) ? previous : (list.cases[0]?.id || '');
    select.replaceChildren();
    if (!list.cases.length) select.add(new Option('Проектов нет', ''));
    for (const item of list.cases) select.add(new Option(item.name, item.id));
    select.value = chosen;
    select.dataset.selected = chosen;
    select.disabled = !chosen;
    savePreference('yaai-studio-case', chosen);
    const overview = chosen
      ? await fetchJson('/api/studio/overview?case=' + encodeURIComponent(chosen))
      : list;
    byId('case-count').textContent = String(list.cases.length);
    byId('task-count').textContent = String(overview.taskCount ?? 0);
    byId('has-api-key').textContent = config.hasApiKey ? 'Да' : 'Нет';
    byId('has-folder').textContent = config.hasFolderId ? 'Да' : 'Нет';
    const configured = Boolean(config.hasApiKey && config.hasFolderId);
    byId('wordstat-ready').textContent = configured ? 'Задано' : 'Не настроено';
    byId('provider-pill').textContent = configured ? 'Конфигурация задана' : 'Требуется настройка';
    const attempts = config.paidApiBudget?.paidAttempts;
    const cap = config.paidApiBudget?.maxPaidRequests;
    byId('api-calls').textContent = Number.isInteger(attempts) ? String(attempts) : 'нет данных';
    byId('budget-stat').textContent = Number.isInteger(attempts) && Number.isInteger(cap)
      ? attempts + ' из ' + cap : 'нет данных';
    renderTasks(overview);
    byId('server-state').textContent = 'ЛОКАЛЬНО · подключено';
  } catch (error) {
    resetMetrics();
    byId('task-list').replaceChildren();
    const msg = 'Не удалось прочитать данные: ' + (error?.message || 'неизвестная ошибка');
    byId('error').textContent = msg + '. Проверьте, что открыли Studio через npm start, а не как отдельный HTML-файл.';
    byId('error').hidden = false;
    byId('server-state').textContent = 'Нет соединения';
    byId('server-state').classList.add('error');
  } finally {
    refreshing = false;
    refreshButton.disabled = false;
  }
}

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => showView(button.dataset.view));
}
for (const button of document.querySelectorAll('[data-go]')) {
  button.addEventListener('click', () => showView(button.dataset.go));
}
byId('case-select').addEventListener('change', () => {
  byId('case-select').dataset.selected = byId('case-select').value;
  refresh();
});
byId('refresh').addEventListener('click', refresh);
for (const button of document.querySelectorAll('[data-topic]')) {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-topic]').forEach(b => b.classList.toggle('selected', b === button));
    const selected = TOPICS[button.dataset.topic];
    if (!selected) return;
    byId('topic-title').textContent = selected[0];
    byId('topic-description').textContent = selected[1];
  });
}
const theme = safePreference('yaai-studio-theme', 'light') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
byId('theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  savePreference('yaai-studio-theme', next);
});
for (const [id, command] of [['copy-mcp','npm run mcp'],['copy-jev','npm run jev:provider']]) {
  byId(id).addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command);
      byId(id).textContent = 'Скопировано ✓';
    } catch {
      byId(id).textContent = 'Выделите текст ниже';
    }
  });
}
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
showView(location.hash.slice(1));
refresh();
