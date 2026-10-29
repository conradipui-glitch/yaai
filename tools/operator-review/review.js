/* YAAI P0-B.4: local browser reviewer; NO fetch/network, no storage, no model calls.
   Preliminary candidate labels never enter this interface. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const allowed=['propose_draft','hold_for_review','insufficient_evidence','cannot_adjudicate'];
const statuses={
  propose_draft:'Есть обоснованное небольшое улучшение',
  hold_for_review:'Нужно перепроверить противоречия',
  insufficient_evidence:'Не хватает оснований для предложения',
  cannot_adjudicate:'Не могу оценить этот случай'
};
const state={blind:null,saved:new Map(),drafts:new Map(),activeIndex:0};
function make(tag,cls,txt){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=String(txt);
  return node;
}
function setStatus(text,isError=false){$('load-status').textContent=text;$('load-status').style.color=isError?'#ad342d':'#527083';}
function safeURL(input){
  try {const u=new URL(input);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}
  catch{return null;}
}
function forbidden(value){
  if(!value||typeof value!=='object')return false;
  return Object.keys(value).some(k=>k==='referenceDecision'||k==='review') || Object.values(value).some(forbidden);
}
function assertBlind(blind){
  if(blind?.source!=='yaai-p0-b4-blind-pack'||!Array.isArray(blind.cases)
     ||blind.cases.length!==19||typeof blind.datasetSha256!=='string'
     ||!(/^[0-9a-f]{64}$/).test(blind.datasetSha256)||forbidden(blind)){
    throw Error('Неверный пакет. Требуется именно слепой экспорт blind.json, созданный CLI.');
  }
  const ids=new Set();
  for(const c of blind.cases){
    if(!c.id||ids.has(c.id)||!Array.isArray(c.sources)||!Array.isArray(c.observations)
       ||!c.prospect||!['synthetic','public_web_paraphrase'].includes(c.origin)){
      throw Error('Повреждённый сценарий или повторённый ID.');
    }
    ids.add(c.id);
  }
}
async function readJSON(file){
  if(!file||file.size>2_000_000)throw Error('Файл отсутствует или слишком большой (максимум 2 МБ).');
  return JSON.parse(await file.text());
}
function updateProgress(){
  const done=state.saved.size,total=state.blind?.cases.length||19;
  $('progress-count').textContent=done+' / '+total;
  $('progress-fill').style.width=(100*done/total)+'%';
  $('finish-status').textContent=done===total?'Все решения сохранены. Экспортируйте файл и выполните проверку CLI.':
    'Выполнено '+done+' из '+total+'. Можно экспортировать черновик.';
}
function listCases(){
  const list=$('case-list');list.replaceChildren();
  state.blind.cases.forEach((c,i)=>{
    const btn=make('button',(i===state.activeIndex?'active ':'')+(state.saved.has(c.id)?'reviewed':''),c.id+' · '+c.prospect.name);
    btn.type='button';btn.addEventListener('click',()=>go(i));
    list.appendChild(btn);
  });
}
function chooseValues(container,attr){
  return [...container.querySelectorAll('input['+attr+']:checked')].map(x=>x.value);
}
function captureDraft(){
  if(!state.blind)return null;
  const inputs=$('decision-choices').querySelectorAll('input[name="decision"]');
  return {
    status:[...inputs].find(x=>x.checked)?.value||'',
    evidenceIds:chooseValues($('observations'),'data-evidence'),
    checkedSourceIds:chooseValues($('sources'),'data-source'),
    sourceCheck:$('source-check').value,
    proposedAction:$('proposed-action').value.trim(),
    reason:$('reason').value.trim(),alternativeExplanation:$('alternative').value.trim(),
    nextCheck:$('next-check').value.trim()
  };
}
function go(next){
  if(state.blind){
    state.drafts.set(state.blind.cases[state.activeIndex].id,captureDraft());
    state.activeIndex=Math.max(0,Math.min(next,state.blind.cases.length-1));
    showCase();
  }
}
function makeChoice(name,value,label,checked=false,attr=''){
  const l=make('label',name==='decision'?'choice':'');
  const input=make('input');
  input.type=name==='decision'?'radio':'checkbox';
  input.name=name;input.value=value;input.checked=checked;
  if(attr)input.setAttribute(attr,'');
  l.append(input,make('span','',label));
  return l;
}
function showCase(){
  const c=state.blind.cases[state.activeIndex];
  const saved=state.drafts.get(c.id)||state.saved.get(c.id)||{};
  $('case-index').textContent='Случай '+(state.activeIndex+1)+' из '+state.blind.cases.length+' · '+c.id;
  $('case-type').textContent=c.origin==='synthetic'?'Учебный пример':'Публичный источник';
  $('case-title').textContent=c.prospect.name;
  $('case-details').textContent=c.niche+' · '+c.region;
  const src=$('sources');src.replaceChildren();
  for(const s of c.sources){
    const block=make('div','source');
    const ch=makeChoice('checkedSourceIds',s.id,s.id+' · '+s.kind,(saved.checkedSourceIds||[]).includes(s.id),'data-source');
    block.appendChild(ch);
    block.appendChild(make('div','meta',s.summary||'Описание отсутствует'));
    block.appendChild(make('small','',s.region+' · зафиксировано: '+(s.observedAt||'неизвестно')));
    const url=s.url&&safeURL(s.url);
    if(c.origin==='public_web_paraphrase'&&url){
      const a=make('a','', 'Открыть первоисточник');
      a.href=url;a.target='_blank';a.rel='noopener noreferrer';
      block.appendChild(a);
    }else if(c.origin==='synthetic'){
      block.appendChild(make('small','','Вымышленный пример: не пытайтесь открыть fixture.example'));
    }
    src.appendChild(block);
  }
  const obs=$('observations');obs.replaceChildren();
  for(const o of c.observations){
    const block=make('div','observation');
    block.appendChild(makeChoice('evidenceIds',o.id,o.id+' · '+o.statement,
      (saved.evidenceIds||[]).includes(o.id),'data-evidence'));
    block.appendChild(make('small','','Источник: '+o.sourceId+
      ' · тип: '+o.kind+' · дата: '+(o.observedAt||'неизвестно')));
    if(o.confidenceLimit)block.appendChild(make('small','','Ограничение: '+o.confidenceLimit));
    obs.appendChild(block);
  }
  const choices=$('decision-choices');choices.replaceChildren();
  for(const st of allowed){
    choices.appendChild(makeChoice('decision',st,statuses[st],saved.status===st));
  }
  const select=$('source-check');select.replaceChildren();
  const opts=c.origin==='synthetic'?
    [['synthetic_only','Использованы только вымышленные данные']]:
    [['','Выберите способ проверки'],['checked_current_page','Открыл(а) актуальный сайт лично'],
     ['checked_saved_paraphrase','Проверил(а) только сохранённый пересказ'],
     ['unavailable','Источник сейчас недоступен']];
  opts.forEach(([v,label])=>{const o=make('option','',label);o.value=v;select.appendChild(o)});
  select.value=saved.sourceCheck||(c.origin==='synthetic'?'synthetic_only':'');
  for(const [id,key] of [['proposed-action','proposedAction'],['reason','reason'],
    ['alternative','alternativeExplanation'],['next-check','nextCheck']])$(id).value=saved[key]||'';
  $('case-error').hidden=true;
  $('prev-case').disabled=state.activeIndex===0;
  $('next-case').disabled=state.activeIndex===state.blind.cases.length-1;
  listCases();updateProgress();
}
function saveCurrent(){
  const c=state.blind.cases[state.activeIndex],d=captureDraft(),errors=[];
  if(!allowed.includes(d.status))errors.push('Выберите одно решение.');
  if(!d.sourceCheck)errors.push('Укажите, как проверяли источник.');
  if(d.reason.length<12||d.alternativeExplanation.length<12||d.nextCheck.length<12)
    errors.push('Заполните обоснование, альтернативу и следующую проверку (не менее 12 символов каждое).');
  if(d.status==='propose_draft'&&(!d.evidenceIds.length||d.proposedAction.length<12))
    errors.push('Для предложения необходимо отметить наблюдения и конкретное действие.');
  if(d.status!=='propose_draft')d.proposedAction=null;
  if(d.sourceCheck==='checked_current_page'&&!d.checkedSourceIds.length)
    errors.push('Отметьте действительно проверенный источник.');
  if(errors.length){$('case-error').textContent=errors.join(' ');$('case-error').hidden=false;return false;}
  const entry={caseId:c.id,...d,reviewedAt:new Date().toISOString()};
  state.saved.set(c.id,entry);state.drafts.delete(c.id);
  $('case-error').hidden=true;
  listCases();updateProgress();
  return true;
}
function exportFile(){
  if(!state.blind)return;
  const entries=state.blind.cases.map(c=>state.saved.get(c.id)).filter(Boolean);
  const review={
    schemaVersion:1,source:'yaai-p0-b4-review-entries',
    datasetSha256:state.blind.datasetSha256,
    reviewer:{alias:$('reviewer-alias').value.trim()||null,
      isHuman:$('human').checked,
      independentOfCandidateAuthor:$('independent').checked,
      blindedUntilSubmission:$('blind-confirm').checked},
    entries,
    instructions:'Submitted from local YAAI review UI. Self-attestation requires separate validation and does not prove independence.'
  };
  const blob=new Blob([JSON.stringify(review,null,2)+'\n'],{type:'application/json'});
  const href=URL.createObjectURL(blob);
  const a=make('a');a.href=href;a.download='P0-B.4-review.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),2500);
  $('finish-status').textContent='Файл сохранён локально: '+entries.length+' из '+state.blind.cases.length+
    '. Для приёмки нужен полный независимый разбор и проверка CLI.';
}
$('blind-input').addEventListener('change',async e=>{
  try{
    const file=e.target.files[0],blind=await readJSON(file);
    assertBlind(blind);
    state.blind=blind;state.saved.clear();state.drafts.clear();state.activeIndex=0;
    $('review-input').disabled=false;$('save-review').disabled=false;
    $('workspace').hidden=false;$('finish').hidden=false;
    showCase();setStatus('Загружены '+blind.cases.length+' случаев. Предварительные ответы не содержатся в пакете.');
  }catch(err){setStatus(err.message,true)}
});
$('review-input').addEventListener('change',async e=>{
  try{
    if(!state.blind)throw Error('Сначала загрузите blind.json');
    const data=await readJSON(e.target.files[0]);
    if(data?.source!=='yaai-p0-b4-review-entries'||data.datasetSha256!==state.blind.datasetSha256
       ||!Array.isArray(data.entries))throw Error('Этот review.json относится к другому набору.');
    const known=new Set(state.blind.cases.map(c=>c.id)),map=new Map();
    for(const x of data.entries){
      if(!known.has(x.caseId)||map.has(x.caseId))throw Error('Неизвестный или повторный ID решения.');
      map.set(x.caseId,x);
    }
    state.saved=map;state.drafts.clear();
    const reviewer=data.reviewer||{};
    $('reviewer-alias').value=reviewer.alias||'';
    $('human').checked=reviewer.isHuman===true;
    $('independent').checked=reviewer.independentOfCandidateAuthor===true;
    $('blind-confirm').checked=reviewer.blindedUntilSubmission===true;
    showCase();setStatus('Восстановлены '+map.size+' сохранённых решений. Проверьте и продолжайте.');
  }catch(err){setStatus(err.message,true)}
});
$('save-case').addEventListener('click',saveCurrent);
$('prev-case').addEventListener('click',()=>go(state.activeIndex-1));
$('next-case').addEventListener('click',()=>go(state.activeIndex+1));
$('export-review').addEventListener('click',exportFile);
$('save-review').addEventListener('click',exportFile);
// A self-contained build embeds the *blind* data only, after validation at build
// time. Normal index.html retains the manual file-upload flow.
const embedded=document.getElementById('embedded-blind-pack');
if(embedded){
  try{
    const blind=JSON.parse(embedded.textContent);
    assertBlind(blind);
    state.blind=blind;state.saved.clear();state.drafts.clear();state.activeIndex=0;
    $('review-input').disabled=false;$('save-review').disabled=false;
    $('workspace').hidden=false;$('finish').hidden=false;
    showCase();
    setStatus('Загружены 19 контрольных случаев. Предварительные решения скрыты.');
    $('blind-input').closest('.upload')?.setAttribute('hidden','');
  }catch(err){setStatus('Ошибка встроенного слепого пакета: '+err.message,true);}
}
window.addEventListener('beforeunload',event=>{
  if(state.blind&&(state.saved.size||state.drafts.size)){
    event.preventDefault();event.returnValue='';
  }
});
})();
