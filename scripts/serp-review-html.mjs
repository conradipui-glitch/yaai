import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADERS = ['id','query','title','excerpt','url','gold_relevance','gold_useful_signal','reviewer_note'];
function requireValid(value, why) { if (!value) throw Error('Blind review HTML: ' + why); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}
export function renderSerpReviewHtml(rows, {topic='обработка заявок'}={}) {
  requireValid(Array.isArray(rows) && rows.length, 'nonempty source rows required');
  const seen = new Set();
  const source = rows.map((row, index) => {
    requireValid(row && typeof row === 'object' &&
      HEADERS.every(name => typeof row[name] === 'string'),
      'invalid blind CSV row ' + (index + 1));
    requireValid(row.id && !seen.has(row.id), 'duplicate or empty ID');
    requireValid(/^https?:\/\/\S+$/i.test(row.url), 'invalid source URL');
    requireValid(['','relevant','irrelevant','unclear'].includes(row.gold_relevance),
      'invalid relevance label');
    requireValid(['','yes','no','unclear'].includes(row.gold_useful_signal),
      'invalid usefulness label');
    requireValid(row.gold_useful_signal !== 'yes' || row.gold_relevance === 'relevant',
      'useful=yes needs relevant label');
    seen.add(row.id);
    return Object.fromEntries(HEADERS.map(k=>[k,row[k]]));
  });
  // None of the model's hidden prediction/reason fields is serialized.
  const data=JSON.stringify(source).replace(/[<>&\u2028\u2029]/g,c=>({
    '<':'\\u003c','>':'\\u003e','&':'\\u0026',
    '\u2028':'\\u2028','\u2029':'\\u2029',
  }[c]));
  const count=source.length;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>YA AI · Разметка поисковой выдачи</title>
<style>
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
--bg:#f4f4ee;--card:#fffefa;--ink:#203338;--text:#44565a;--muted:#6e7c7d;
--line:#dce1da;--teal:#126c60;--mint:#e5f1e8;--coral:#a96540;--sand:#f9efdc;
background:var(--bg);color:var(--ink)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}
button,textarea,select,input{font:inherit}button{cursor:pointer}
button:disabled{opacity:.42;cursor:not-allowed}
a{color:var(--teal);text-underline-offset:3px}a:hover{color:#0d4c47}
:focus-visible{outline:3px solid #327da1;outline-offset:3px}
.page{max-width:1500px;margin:auto;padding:0 36px 70px}
.top{height:76px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:14px}
.logo{font-size:26px;letter-spacing:-.065em;font-weight:850}
.logo small{font-size:10px;letter-spacing:.18em;margin-left:14px;color:var(--teal)}
.offline{border:1px solid #b6d6c6;background:#eaf4ec;border-radius:100px;color:#1b685c;padding:7px 12px;font-size:12px;font-weight:750}
.intro{padding:42px 0 26px;display:flex;justify-content:space-between;gap:30px;align-items:end}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:850;color:var(--teal)}
h1{font-size:clamp(30px,4vw,52px);line-height:1.06;letter-spacing:-.065em;margin:13px 0 12px}
.intro p{line-height:1.65;color:var(--text);font-size:14px;max-width:670px;margin:0}
.intro .stamp{font-size:12px;color:var(--muted);text-align:right;line-height:1.65;max-width:270px}
.progress-shell{background:var(--card);border:1px solid var(--line);padding:18px 24px;border-radius:15px;margin-bottom:18px}
.progress-line{display:flex;align-items:center;justify-content:space-between;gap:14px}
.progress-line b{font-size:14px}.progress-line span{font-size:13px;color:var(--muted)}
.track{height:8px;border-radius:9px;background:#e9ede7;overflow:hidden;margin-top:11px}
.fill{width:0;background:var(--teal);height:100%;transition:width .2s}
.workspace{display:grid;grid-template-columns:minmax(240px,310px) minmax(0,1fr);align-items:start;gap:18px}
.sidebar,.editor{background:var(--card);border:1px solid var(--line);border-radius:17px;overflow:hidden}
.side-heading{padding:19px 20px 14px;border-bottom:1px solid var(--line)}
.side-heading b{display:block;font-size:15px;margin:8px 0}
.side-heading p{color:var(--muted);font-size:12px;line-height:1.45;margin:0}
.side-tools{padding:12px 14px;border-bottom:1px solid var(--line)}
.side-tools select{width:100%;border-radius:10px;padding:10px;border:1px solid #c9d6d1;background:white;color:var(--ink)}
.items{max-height:min(64vh,680px);overflow:auto;padding:8px}
.items button{display:grid;grid-template-columns:31px 1fr 11px;gap:10px;width:100%;align-items:start;
border:1px solid transparent;background:transparent;text-align:left;border-radius:10px;padding:11px 9px;color:var(--ink)}
.items button:hover{background:#f3f6ef}.items button.active{border-color:#add6c3;background:var(--mint)}
.items .num{font-size:12px;font-weight:800;color:var(--muted);line-height:1.5}
.items .item-title{font-size:12px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.state-dot{width:8px;height:8px;border:1.5px solid #bccbc4;border-radius:50%;margin-top:5px}
.items button.done .state-dot{background:var(--teal);border-color:var(--teal)}
.editor-head{padding:22px 30px;background:#f7f9f3;border-bottom:1px solid var(--line)}
.head-top{display:flex;justify-content:space-between;align-items:center;gap:12px}
.pill{background:var(--mint);color:var(--teal);font-size:11px;font-weight:800;border-radius:8px;padding:6px 9px}
.editor-head .counter{font-size:12px;color:var(--muted)}
h2{font-size:clamp(25px,2.7vw,36px);letter-spacing:-.045em;line-height:1.17;margin:17px 0 15px;overflow-wrap:anywhere}
.label{font-size:11px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:var(--teal)}
.query{border-left:3px solid #b7d1c4;padding:7px 0 7px 12px;line-height:1.5;font-size:14px;color:var(--text);margin-bottom:14px;overflow-wrap:anywhere}
.excerpt{font-size:16px;line-height:1.75;color:#3c5356;margin:0 0 15px;overflow-wrap:anywhere;white-space:pre-wrap}
.url{display:inline-block;font-size:13px;max-width:100%;overflow-wrap:anywhere}
.block{padding:22px 30px;border-bottom:1px solid var(--line)}
.block h3{font-size:18px;letter-spacing:-.025em;margin:7px 0}
.block .hint{margin:0 0 16px;font-size:13px;color:var(--muted);line-height:1.5}
.choices{display:flex;flex-wrap:wrap;gap:9px}
.choice{flex:1 1 150px;display:flex;flex-direction:column;align-items:flex-start;gap:7px;
min-height:80px;border:1px solid #c8d4cf;background:#fff;padding:13px;border-radius:11px;text-align:left;
color:var(--ink);font-weight:750;font-size:14px}
.choice:hover{border-color:var(--teal);background:#f6fbf6}
.choice.active{background:var(--mint);border:2px solid var(--teal);padding:12px}
.key{font-size:10px;color:var(--muted);font-weight:650}
.note{width:100%;min-height:85px;border:1px solid #c8d4cf;padding:14px;line-height:1.5;resize:vertical;border-radius:10px;background:#fff}
.actions{padding:22px 30px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.actions .group{display:flex;flex-wrap:wrap;gap:9px}
.btn{border:1px solid #c8d4cf;padding:12px 15px;border-radius:10px;background:white;color:var(--ink);font-weight:750;font-size:13px}
.btn:hover{background:#f4f8f4}.btn.primary{background:var(--teal);color:white;border-color:var(--teal)}
.btn.primary:hover{background:#0d534a}.btn.soft{background:var(--mint);color:var(--teal);border-color:#a8cdbb}
.notice{margin-top:17px;background:var(--sand);border-left:3px solid var(--coral);padding:16px 19px;font-size:13px;line-height:1.6;color:#755735}
.notice b{color:#775335}
.footer{display:flex;justify-content:space-between;gap:16px;font-size:12px;color:var(--muted);margin-top:22px}
#toast{position:fixed;right:18px;bottom:18px;padding:14px 20px;max-width:400px;border-radius:12px;
background:#203e3d;color:white;font-size:13px;line-height:1.5;z-index:5;box-shadow:0 8px 28px #1b3e3b33}
#toast[hidden]{display:none}
@media(max-width:1000px){.page{padding:0 18px 44px}.workspace{grid-template-columns:240px minmax(0,1fr)}
.block,.editor-head,.actions{padding:18px 20px}}
@media(max-width:700px){.top{height:64px}.logo small{display:none}.intro{padding:26px 0 21px;display:block}
.intro .stamp{text-align:left;margin-top:10px}.workspace{grid-template-columns:1fr}
.sidebar{border-radius:13px}.items{max-height:153px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px}
.items button{padding:9px 6px;grid-template-columns:24px 1fr 8px}.items .item-title{font-size:11px}
.editor-head,.block,.actions{padding:18px}.progress-shell{padding:15px}
h2{font-size:27px}.choices{gap:7px}.choice{flex:1 1 110px;min-height:67px;padding:10px;font-size:13px}
.choice.active{padding:9px}.footer{display:block;line-height:1.8}}
@media(prefers-reduced-motion:reduce){.fill{transition:none}}
</style></head><body><div class="page">
<header class="top"><div class="logo">yaai <small>RESEARCH / REVIEW</small></div>
<span class="offline">● Офлайн · Без API</span></header>
<section class="intro"><div>
 <span class="eyebrow">Независимая проверка / QA · 01</span>
 <h1>Проверка поисковой выдачи</h1>
 <p>Оценивай страницу по её содержанию — без подсказок от алгоритма. Данные
 не отправляются на сервер. Сохраняй промежуточные ответы в CSV и загружай
 их обратно, чтобы продолжить.</p></div>
 <div class="stamp">Тема: <b>${escapeHtml(topic)}</b><br>${count} источников · оценка по одному</div>
</section>
<div class="progress-shell">
 <div class="progress-line"><b>Заполнено: <span id="progress-num" style="color:var(--teal)">0 / ${count}</span></b>
 <span id="progress-sub">Оценки ещё не заполнены</span></div>
 <div class="track"><div class="fill" id="progress-fill"></div></div>
</div>
<div class="workspace">
<aside class="sidebar">
 <div class="side-heading"><span class="eyebrow">Навигация</span>
 <b>Список источников</b><p>Можно переходить в любом порядке. Зелёная точка означает,
 что оба поля оценки заполнены.</p></div>
 <div class="side-tools"><label class="label" for="show-filter">Показать записи</label>
 <select id="show-filter"><option value="all">Все источники</option>
 <option value="unfinished">Только незаполненные</option>
 <option value="finished">Только заполненные</option></select></div>
 <div id="items" class="items" aria-label="Выбор страницы для оценки"></div>
</aside>
<main class="editor">
 <header class="editor-head">
  <div class="head-top"><span class="pill">Оцени содержимое страницы</span>
  <span class="counter" id="counter"></span></div>
  <h2 id="doc-title"></h2>
  <div class="label">Исходный поисковый запрос</div><p class="query" id="query"></p>
  <div class="label">Фрагмент поисковой выдачи</div><p class="excerpt" id="excerpt"></p>
  <a class="url" id="source-link" target="_blank" rel="noopener noreferrer">Открыть оригинальную страницу ↗</a>
 </header>
 <section class="block" aria-labelledby="relevance-heading">
  <span class="eyebrow">Вопрос 1 из 2</span><h3 id="relevance-heading">Относится ли страница к теме исследования?</h3>
  <p class="hint">Тема — обработка заявок клиентов и связанные бизнес-процессы.
  Не путай с именами людей, дорожными работами и другими значениями слов.
  При недостаточном контексте выбирай «Неясно».</p>
  <div class="choices" id="relevance-choices">
    <button class="choice" type="button" data-r="relevant"><span>Да, относится</span><span class="key">Клавиша 1</span></button>
    <button class="choice" type="button" data-r="irrelevant"><span>Нет, не относится</span><span class="key">Клавиша 2</span></button>
    <button class="choice" type="button" data-r="unclear"><span>Неясно по фрагменту</span><span class="key">Клавиша 3</span></button>
  </div>
 </section>
 <section class="block" aria-labelledby="useful-heading">
  <span class="eyebrow">Вопрос 2 из 2</span><h3 id="useful-heading">Есть ли потенциально полезный сигнал?</h3>
  <p class="hint">Например: проблема клиента, типичная ошибка, ограничение или новая потребность.
  Просто реклама продавца не доказывает боль покупателей.
  «Да» допустимо только для релевантной страницы.</p>
  <div class="choices" id="useful-choices">
    <button class="choice" type="button" data-u="yes"><span>Да, есть сигнал</span><span class="key">Клавиша 4</span></button>
    <button class="choice" type="button" data-u="no"><span>Нет сигнала</span><span class="key">Клавиша 5</span></button>
    <button class="choice" type="button" data-u="unclear"><span>Неясно</span><span class="key">Клавиша 6</span></button>
  </div>
 </section>
 <section class="block" aria-labelledby="notes-heading">
   <span class="eyebrow">Контекст</span><h3 id="notes-heading">Комментарий — по желанию</h3>
   <textarea class="note" id="notes" placeholder="Почему ты так оценил страницу? Что стоит проверить позже?"></textarea>
 </section>
 <div class="actions">
  <div class="group"><button type="button" class="btn" id="previous">← Назад</button>
  <button type="button" class="btn" id="next">Дальше →</button>
  <button type="button" class="btn" id="clear">Очистить оценку</button></div>
  <div class="group">
  <button type="button" class="btn soft" id="load">Загрузить CSV</button>
  <button type="button" class="btn primary" id="save">Сохранить ответы в CSV ↓</button>
  </div>
 </div>
</main></div>
<div class="notice"><b>Важно для качества исследования.</b> Здесь нет оценок и причин,
выданных фильтром YA AI — это независимая разметка. Не обязательно заполнять
все 48 за раз: сохраняй CSV и загружай его при следующем открытии.
Если источник неясен, выбирай «Неясно», а не угадывай.
Открытие оригинального сайта — единственное действие, которое может
использовать интернет.</div>
<footer class="footer"><span>YA AI · Blind SERP Evidence Review · Ничего не отправляется на сервер</span>
<span>Формат экспортированного CSV совместим с <code>serp-relevance-benchmark.mjs score</code></span></footer>
</div><input type="file" id="file" accept=".csv,text/csv" hidden>
<div id="toast" role="status" aria-live="polite" hidden></div>
<script id="rows-json" type="application/json">${data}</script>
<script>
(() => {
'use strict';
const original=JSON.parse(document.getElementById('rows-json').textContent);
const records=original.map(row=>({...row}));
const header=['id','query','title','excerpt','url','gold_relevance','gold_useful_signal','reviewer_note'];
const $=id=>document.getElementById(id);
let current=0,dirty=false;
const validRel=new Set(['','relevant','irrelevant','unclear']);
const validUse=new Set(['','yes','no','unclear']);
function completed(row){return Boolean(row.gold_relevance&&row.gold_useful_signal);}
function toast(message){
  const node=$('toast');node.textContent=message;node.hidden=false;
}
function label(row){return row.title||row.query||'Без заголовка';}
function updateList(){
 const el=$('items');el.replaceChildren();
 const filter=$('show-filter').value;
 records.forEach((row,i)=>{
   const done=completed(row);
   if(filter==='finished'&&!done||filter==='unfinished'&&done)return;
   const b=document.createElement('button');
   b.type='button';b.className=(i===current?'active ':'')+(done?'done':'');
   b.setAttribute('aria-label','Источник '+(i+1)+' '+label(row));
   const n=document.createElement('span');n.className='num';n.textContent=String(i+1).padStart(2,'0');
   const title=document.createElement('span');title.className='item-title';title.textContent=label(row);
   const dot=document.createElement('span');dot.className='state-dot';dot.setAttribute('aria-hidden','true');
   b.append(n,title,dot);
   b.addEventListener('click',()=>navigate(i));
   el.append(b);
 });
}
function updateProgress(){
 const done=records.filter(completed).length;
 $('progress-num').textContent=done+' / '+records.length;
 $('progress-sub').textContent=done===records.length?'Все поля заполнены. Сохрани CSV.':
   'Осталось оценить: '+(records.length-done);
 $('progress-fill').style.width=(done/records.length*100)+'%';
}
function show(){
 const row=records[current];
 $('counter').textContent='Источник '+(current+1)+' / '+records.length;
 $('doc-title').textContent=label(row);
 $('query').textContent=row.query;
 $('excerpt').textContent=row.excerpt||'Нет фрагмента в источнике';
 $('source-link').href=row.url;
 $('source-link').textContent='Открыть оригинал ↗ '+new URL(row.url).hostname;
 $('notes').value=row.reviewer_note;
 document.querySelectorAll('[data-r]').forEach(button=>{
   const selected=button.dataset.r===row.gold_relevance;
   button.classList.toggle('active',selected);
   button.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-u]').forEach(button=>{
   const selected=button.dataset.u===row.gold_useful_signal;
   button.classList.toggle('active',selected);
   button.setAttribute('aria-pressed',String(selected));
 });
 $('previous').disabled=current===0;
 $('next').disabled=current===records.length-1;
 updateList();updateProgress();
}
function navigate(index){if(index<0||index>=records.length)return;current=index;show();}
function setRel(val){
 const row=records[current];row.gold_relevance=row.gold_relevance===val?'':val;
 if(row.gold_relevance!=='relevant'&&row.gold_useful_signal==='yes')row.gold_useful_signal='';
 dirty=true;show();
}
function setUseful(val){
 const row=records[current],next=row.gold_useful_signal===val?'':val;
 if(next==='yes'&&row.gold_relevance!=='relevant'){
   toast('Сначала отметь страницу как относящуюся к теме. Полезный сигнал «Да» допустим только для релевантной страницы.');
   return;
 }
 row.gold_useful_signal=next;dirty=true;show();
}
document.querySelectorAll('[data-r]').forEach(b=>b.addEventListener('click',()=>setRel(b.dataset.r)));
document.querySelectorAll('[data-u]').forEach(b=>b.addEventListener('click',()=>setUseful(b.dataset.u)));
$('previous').addEventListener('click',()=>navigate(current-1));
$('next').addEventListener('click',()=>navigate(current+1));
$('show-filter').addEventListener('change',updateList);
$('notes').addEventListener('input',event=>{
 records[current].reviewer_note=event.target.value;dirty=true;
});
$('clear').addEventListener('click',()=>{
 records[current].gold_relevance='';records[current].gold_useful_signal='';
 records[current].reviewer_note='';dirty=true;show();
});
document.addEventListener('keydown',event=>{
 if(event.altKey||event.ctrlKey||event.metaKey)return;
 if(event.target instanceof HTMLElement &&
   (event.target.matches('textarea,input,select')||event.target.isContentEditable))return;
 const r={'1':'relevant','2':'irrelevant','3':'unclear'}[event.key];
 const u={'4':'yes','5':'no','6':'unclear'}[event.key];
 if(r){event.preventDefault();setRel(r);}
 if(u){event.preventDefault();setUseful(u);}
 if(event.key==='ArrowRight'){event.preventDefault();navigate(current+1);}
 if(event.key==='ArrowLeft'){event.preventDefault();navigate(current-1);}
});
function quoteCsv(v){
 let str=String(v??'');
 if(/^\\s*[=+@-]/u.test(str))str="'"+str;
 return '"'+str.replace(/"/g,'""')+'"';
}
function exportCsv(){
 const csv='\\ufeff'+[header,...records.map(row=>header.map(k=>row[k]))]
  .map(row=>row.map(quoteCsv).join(';')).join('\\r\\n')+'\\r\\n';
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='yaai-serp-review-labeled.csv';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
 dirty=false;
 toast('CSV сохранён. Храни его у себя и загружай через кнопку «Загрузить CSV», чтобы продолжить.');
}
$('save').addEventListener('click',exportCsv);
function parseCsv(text){
 const str=String(text).replace(/^\\ufeff/u,'');
 const rows=[];let row=[],field='',inside=false;
 for(let i=0;i<str.length;i++){
  const c=str[i];
  if(inside){
   if(c==='"'&&str[i+1]==='"'){field+='"';i++;}
   else if(c==='"')inside=false;
   else field+=c;
  }else if(c==='"'){
   if(field!=='')throw Error('Неверные кавычки в CSV');
   inside=true;
  }else if(c===';'){row.push(field);field='';}
  else if(c==='\\r'&&str[i+1]==='\\n'){row.push(field);rows.push(row);field='';row=[];i++;}
  else if(c==='\\n'){row.push(field);rows.push(row);field='';row=[];}
  else field+=c;
 }
 if(inside)throw Error('В CSV не закрыта кавычка');
 if(field||row.length){row.push(field);rows.push(row);}
 return rows;
}
function sameSource(field,actual,expected){
 return actual===expected||actual==="'"+expected;
}
function loadCsv(text){
 const rows=parseCsv(text),received=rows.shift();
 if(JSON.stringify(received)!==JSON.stringify(header))
  throw Error('Нужен CSV слепой разметки YA AI, а не файл решений алгоритма.');
 if(rows.length!==records.length)throw Error('Число строк отличается от исходной выборки.');
 const map=new Map(original.map(row=>[row.id,row]));
 const seen=new Set(),updates=[];
 for(const cols of rows){
  if(cols.length!==header.length)throw Error('Неожиданное число столбцов CSV');
  const row=Object.fromEntries(header.map((key,i)=>[key,cols[i]]));
  const expected=map.get(row.id);
  if(!expected||seen.has(row.id))throw Error('Неизвестный или повторяющийся ID');
  seen.add(row.id);
  for(const field of ['query','title','excerpt','url']){
   if(!sameSource(field,row[field],expected[field]))throw Error('Изменён исходный текст записи '+row.id);
  }
  if(!validRel.has(row.gold_relevance)||!validUse.has(row.gold_useful_signal))
    throw Error('Некорректная оценка у '+row.id);
  if(row.gold_useful_signal==='yes'&&row.gold_relevance!=='relevant')
    throw Error('Полезный сигнал требует оценки «относится к теме»');
  updates.push(row);
 }
 // Apply only if all rows are valid: no partial load on errors.
 const byId=new Map(updates.map(r=>[r.id,r]));
 for(const row of records){
  const restored=byId.get(row.id);
  row.gold_relevance=restored.gold_relevance;
  row.gold_useful_signal=restored.gold_useful_signal;
  row.reviewer_note=restored.reviewer_note;
 }
 dirty=false;show();
 toast('Разметка загружена. Заполнено '+records.filter(completed).length+' из '+records.length+'.');
}
$('load').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try{loadCsv(await file.text());}
 catch(err){toast('Ошибка загрузки: '+err.message);}
 finally{event.target.value='';}
});
window.addEventListener('beforeunload',event=>{
 if(dirty){event.preventDefault();event.returnValue='';}
});
show();
})();
</script></body></html>`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const flag=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const input=flag('--blind'),output=flag('--html');
  if(!input||!output)throw Error('Usage: node scripts/serp-review-html.mjs --blind pilot.blind.csv --html pilot.review.html');
  const raw=await fs.readFile(input,'utf8');
  // A compact source-only CSV reader for CLI operation.
  const records=[];let row=[],field='',quotes=false;
  const csv=raw.replace(/^\ufeff/u,'');
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(quotes){if(c==='"'&&csv[i+1]==='"'){field+='"';i++;}
      else if(c==='"')quotes=false;else field+=c;}
    else if(c==='"'){if(field)throw Error('Malformed blind CSV quote');quotes=true;}
    else if(c===';'){row.push(field);field='';}
    else if(c==='\r'&&csv[i+1]==='\n'){row.push(field);records.push(row);field='';row=[];i++;}
    else if(c==='\n'){row.push(field);records.push(row);field='';row=[];}
    else field+=c;
  }
  if(quotes)throw Error('Unclosed CSV quote');
  if(field||row.length){row.push(field);records.push(row);}
  const header=records.shift();
  requireValid(JSON.stringify(header)===JSON.stringify(HEADERS),'expected 8-column blind review CSV');
  const source=records.map(row=>{
    requireValid(row.length===HEADERS.length,'malformed CSV row');
    return Object.fromEntries(HEADERS.map((key,i)=>[key,row[i]]));
  });
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await fs.writeFile(output,renderSerpReviewHtml(source),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({html:path.resolve(output),sources:source.length,
    paidApiCalls:0,humanLabels:source.filter(r=>r.gold_relevance).length},null,2));
}
