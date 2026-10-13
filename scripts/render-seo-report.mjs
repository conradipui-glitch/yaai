import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build a shareable SEO report from saved research, without live API requests.
const insist=(ok,reason)=>{if(!ok)throw Error('SEO report integrity: '+reason);};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x.toLocaleString('ru-RU'):'нет данных';
const id=x=>String(x?.regionId)+'|'+String(x?.phrase||'').trim().toLocaleLowerCase('ru');

export function buildSeoReport(wordstat,intents,plan) {
  insist(Array.isArray(wordstat?.rows)&&Array.isArray(wordstat?.calls)&&Array.isArray(wordstat?.seeds)&&Array.isArray(wordstat?.regions),'Wordstat input');
  insist(wordstat.rowCount===wordstat.rows.length&&typeof wordstat.generatedAt==='string','Wordstat row count/date');
  insist(wordstat.calls.length===wordstat.seeds.length*wordstat.regions.length,'incomplete Wordstat calls');
  insist(Array.isArray(intents?.classifiedRows)&&Array.isArray(intents?.summary),'intents input');
  insist(intents.source?.generatedAt===wordstat.generatedAt&&intents.source?.rawRows===wordstat.rows.length,'intent source/date');
  insist(JSON.stringify(intents.source.seeds)===JSON.stringify(wordstat.seeds),'intent seeds');
  insist(JSON.stringify(intents.source.regions)===JSON.stringify(wordstat.regions),'intent regions');
  insist(intents.meta?.inputRows===wordstat.rows.length&&intents.meta?.eligibleRows===intents.classifiedRows.length,'intent row count');
  insist(intents.meta.assignedRows+intents.meta.unassignedRows+intents.meta.negativeRows===intents.meta.eligibleRows,'intent status count');
  insist(Array.isArray(plan?.pages)&&Array.isArray(plan?.holdRows),'plan input');
  insist(plan.meta?.presetId===intents.meta?.presetId&&plan.meta?.inputClassifiedRows===intents.classifiedRows.length,'plan source/preset');
  insist(plan.meta.pageCandidates===plan.pages.length,'plan count');
  const raw=new Map(),used=new Set();
  for(const r of wordstat.rows){
    insist(typeof r.phrase==='string'&&r.regionId!=null&&Array.isArray(r.types)&&Array.isArray(r.seeds),'invalid raw row');
    insist(!raw.has(id(r)),'duplicate raw row');
    raw.set(id(r),r);
  }
  for(const r of intents.classifiedRows){
    const original=raw.get(id(r));
    insist(original&&!used.has(id(r)),'missing/duplicate classified row');
    insist(original.count===r.count&&JSON.stringify(original.types)===JSON.stringify(r.types),'altered classified count/types');
    used.add(id(r));
  }
  const pages=plan.pages.map(p=>{
    insist(typeof p.title==='string'&&typeof p.path==='string'&&['create','expand','merge','hold'].includes(p.decision),'page action');
    insist(p.maxCount==null||(typeof p.maxCount==='number'&&Number.isFinite(p.maxCount)&&p.maxCount>=0),'page count');
    return {title:p.title,path:p.path,decision:p.decision,priority:p.businessPriority||null,
      strongestPhrase:p.strongestPhrase||null,strongestRegion:p.strongestRegion||null,maxCount:p.maxCount??null,
      regions:(p.regions||[]).map(r=>({name:r.regionName,count:r.maxCount??null}))};
  });
  return {schema:'yaai-seo-evidence-report',version:1,
    source:{kind:'Yandex Wordstat TopRequests',generatedAt:wordstat.generatedAt,
      regions:wordstat.regions.map(x=>x.name),seeds:wordstat.seeds},
    analysis:{presetId:intents.meta.presetId,presetName:intents.meta.presetName||intents.meta.presetId},
    summary:{requests:wordstat.calls.length,rawRows:wordstat.rows.length,
      topRows:wordstat.rows.filter(x=>x.types.includes('top')).length,
      eligible:intents.classifiedRows.length,assigned:intents.meta.assignedRows,unassigned:intents.meta.unassignedRows,
      pages:pages.length,review:plan.holdRows.length},
    pages,queries:intents.classifiedRows.map(r=>({phrase:r.phrase,region:r.regionName||r.regionId,count:r.count??null,
      types:r.types,queryType:r.queryType||'unknown',intent:r.intentTitle||null,action:r.nextAction||null})),
    limitations:[
      'Частотности Wordstat пересекаются; суммировать фразы и регионы как объём рынка нельзя.',
      'Intent и Page Planner — эвристические рекомендации, не подтверждённые продажи или конверсии.',
      'SERP, Jev, отзывы, цены, лиды и выручка этим отчётом не проверялись.',
      'Дата относится к исходному исследованию, повторная генерация не обновляет данные.'
    ]};
}

export function renderSeoReportHtml(r) {
  const css='*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#f2f5ff;font:15px/1.55 system-ui,Segoe UI,sans-serif}main{max-width:1150px;margin:auto;padding:42px 22px 80px}h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.04em;line-height:1.15}h2{margin:38px 0 14px}.muted,small{color:#b4c1d2}.eyebrow{color:#9ee4d1;text-transform:uppercase;font-size:12px;letter-spacing:.14em}.metrics,.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.metric,.card,.panel{background:#171e31;border:1px solid #343d50;border-radius:15px;padding:18px}.metric b{display:block;font-size:30px}.card{display:flex;flex-direction:column;gap:9px}.card h3{margin:0}.card code{overflow-wrap:anywhere;color:#cce7ff}.tag{color:#a6ebdc;font-size:12px;border:1px solid #59736c;padding:3px 8px;border-radius:20px;align-self:flex-start}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}input,select,button{background:#131b2a;color:white;border:1px solid #516079;border-radius:10px;padding:10px;font:inherit}input{min-width:200px;flex:1}button{background:#9ee4d1;color:#082a23;cursor:pointer;font-weight:bold}.table-wrap{max-height:630px;overflow:auto;border:1px solid #343d50;border-radius:10px}table{border-collapse:collapse;min-width:740px;width:100%;font-size:13px}td,th{border-bottom:1px solid #343d50;padding:11px;text-align:left;vertical-align:top}th{background:#233049;position:sticky;top:0}tr[hidden]{display:none}li{margin:8px 0}@media(max-width:650px){main{padding:25px 13px}.controls>*{width:100%;min-width:0}}@media print{body{background:white;color:black}.metric,.card,.panel{background:white;color:black;border-color:#aaa}.controls{display:none}.table-wrap{max-height:none;overflow:visible}table{min-width:0}th{position:static;background:#eee;color:black}}';
  const metric=(name,value,note)=>'<div class="metric"><small>'+esc(name)+'</small><b>'+n(value)+'</b><small>'+esc(note)+'</small></div>';
  const cards=r.pages.map(p=>'<article class="card"><span class="tag">'+esc(p.decision.toUpperCase())+' · '+esc(p.priority||'без приоритета')+'</span><h3>'+esc(p.title)+'</h3><code>'+esc(p.path)+'</code><div><small>Максимум отдельной фразы</small><b style="display:block;font-size:28px">'+n(p.maxCount)+'</b><small>'+esc(p.strongestPhrase||'нет данных')+' · '+esc(p.strongestRegion||'регион не указан')+'</small></div><small>'+p.regions.map(x=>esc(x.name)+': '+n(x.count)).join(' · ')+'</small></article>').join('');
  const rows=r.queries.map(q=>'<tr data-type="'+esc(q.queryType)+'"><td>'+esc(q.phrase)+'</td><td>'+esc(q.region)+'</td><td>'+n(q.count)+'</td><td>'+esc(q.types.join(', '))+'</td><td>'+esc(q.queryType)+'</td><td>'+esc(q.intent||'—')+'</td><td>'+esc(q.action||'—')+'</td></tr>').join('');
  const js='(()=>{const rows=[...document.querySelectorAll("#queryRows tr")],search=document.getElementById("search"),type=document.getElementById("type");function filter(){let count=0;for(const row of rows){row.hidden=!( (!search.value||row.textContent.toLocaleLowerCase("ru").includes(search.value.toLocaleLowerCase("ru"))) && (!type.value||row.dataset.type===type.value));if(!row.hidden)count++;}document.getElementById("shown").textContent=count+" из "+rows.length;}search.addEventListener("input",filter);type.addEventListener("change",filter);document.getElementById("export").addEventListener("click",()=>{const csv=[["Фраза","Регион","Частотность","Источник","Тип","Intent","Действие"]];for(const row of rows.filter(r=>!r.hidden))csv.push([...row.querySelectorAll("td")].map(x=>x.textContent.trim()));const quote=v=>{let s=String(v??"");if(/^[\\s]*[=+@\\-\\t\\r]/.test(s))s="\\u0027"+s;return "\\\""+s.replaceAll("\\\"","\\\"\\\"")+"\\\"";};const blob=new Blob(["\\ufeff"+csv.map(r=>r.map(quote).join(",")).join("\\r\\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="yaai-seo-visible.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),500);});filter();})();';
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YA AI · '+esc(r.analysis.presetName)+'</title><style>'+css+'</style></head><body><main>'+
    '<header><div class="eyebrow">YA AI / офлайн-отчёт / сохранённые данные</div><h1>'+esc(r.analysis.presetName)+'</h1><p class="muted">Источник: Wordstat TopRequests · '+esc(r.source.generatedAt)+' · '+esc(r.source.regions.join(' / '))+'. Числа не означают количество клиентов.</p></header>'+
    '<section class="metrics">'+metric('Сохранённые вызовы',r.summary.requests,'новых API-вызовов: 0')+metric('Исходные строки',r.summary.rawRows,'Top + связанные')+metric('Top-запросы',r.summary.topRows,'содержат TopRequests')+metric('Классифицировано',r.summary.eligible,'локальная эвристика')+metric('Привязано к intent',r.summary.assigned,'рабочая классификация')+metric('Страницы',r.summary.pages,'предложения планировщика')+'</section>'+
    '<h2>Рекомендации по страницам</h2><p class="muted">CREATE/EXPAND/MERGE/HOLD — предложения для ручной проверки. Показаны максимумы отдельных запросов, а не сумма рынка.</p><section class="cards">'+(cards||'<div class="panel">Кандидатов страниц нет.</div>')+'</section>'+
    '<h2>Исходные поисковые свидетельства</h2><p class="muted">Поиск, фильтрация и выгрузка CSV работают без интернета. На мобильном таблица прокручивается.</p>'+
    '<div class="controls"><input id="search" type="search" aria-label="Поиск по фразам" placeholder="Фраза, регион, intent…"><select id="type" aria-label="Тип запроса"><option value="">Все типы</option><option value="commercial">Commercial</option><option value="informational">Informational</option><option value="unmapped">Unmapped</option><option value="noise">Noise</option></select><button type="button" id="export">Экспорт видимых CSV</button><small id="shown" role="status" aria-live="polite"></small></div>'+
    '<div class="table-wrap"><table><thead><tr><th>Фраза</th><th>Регион</th><th>Частотность</th><th>Источник</th><th>Тип</th><th>Intent</th><th>Действие</th></tr></thead><tbody id="queryRows">'+rows+'</tbody></table></div>'+
    '<h2>Статус и ограничения</h2><div class="panel"><p>FACT: сохранённые данные Wordstat. INFERENCE: намерения и Page Planner. UNKNOWN: реальные заявки, цена и конверсия.</p><ul>'+r.limitations.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul><small>Начальные запросы: '+esc(r.source.seeds.join(' · '))+'. API-ключи и Folder ID не включены.</small></div><p class="muted">YA AI · Автономный HTML без внешних скриптов и аналитики.</p>'+
    '</main><script>'+js+'</script></body></html>';
}

const argv=process.argv.slice(2);
function argument(flag){const i=argv.indexOf(flag),inline=argv.find(x=>x.startsWith(flag+'='));return inline?inline.slice(flag.length+1):i<0?null:argv[i+1];}
function required(flag){const v=argument(flag);if(!v||v.startsWith('--'))throw Error('Required: '+flag+' FILE');return path.resolve(v);}
async function main(){
  if(argv.includes('--help')||!argv.length){console.log('Usage: --wordstat FILE --intents FILE --plan FILE --html FILE [--json FILE]');return;}
  const sources=[required('--wordstat'),required('--intents'),required('--plan')],html=required('--html');
  const json=path.resolve(argument('--json')||html.replace(/\.html?$/i,'')+'.json');
  insist(new Set([...sources,html,json]).size===5,'input/output paths must be unique');
  const [wordstat,intents,plan]=await Promise.all(sources.map(p=>fs.readFile(p,'utf8').then(JSON.parse)));
  const report=buildSeoReport(wordstat,intents,plan),document=renderSeoReportHtml(report);
  await fs.mkdir(path.dirname(html),{recursive:true});await fs.mkdir(path.dirname(json),{recursive:true});
  for(const p of [html,json]){try{await fs.lstat(p);throw Error('Output exists: '+p);}catch(e){if(e.code!=='ENOENT')throw e;}}
  let wrote=false;
  try{await fs.writeFile(json,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});wrote=true;await fs.writeFile(html,document,{flag:'wx',mode:0o600});}
  catch(e){if(wrote)await fs.unlink(json).catch(()=>{});throw e;}
  console.log(JSON.stringify({html,json,pages:report.summary.pages,sourceRows:report.summary.rawRows,paidApiCalls:0},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
