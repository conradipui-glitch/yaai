import {KNOWLEDGE_RULE_VERSION,KNOWLEDGE_TOPICS} from './knowledge-content.js';
import {calculateKnowledgeExample} from './knowledge-metrics.js';

const get=id=>document.getElementById(id);
const percent=n=>n===null?'нет данных':(100*n).toLocaleString('ru-RU',{
  minimumFractionDigits:2,maximumFractionDigits:2,
})+'%';
const delta=n=>n===null?'нельзя рассчитать от нуля':
  (n>=0?'+':'')+(100*n).toLocaleString('ru-RU',{
    minimumFractionDigits:1,maximumFractionDigits:1,
  })+'%';

export function setupKnowledgeLayer(){
  const drawer=get('knowledgeDrawer'),backdrop=get('knowledgeBackdrop');
  if(!drawer||!backdrop)return;
  const close=get('knowledgeClose');
  const fields=['impressions','clicks','conversions'];
  let previousFocus=null,selected='ctr';

  function showExample(){
    const read=prefix=>Object.fromEntries(fields.map(name=>{
      const input=get('knowledge-'+prefix+'-'+name);
      if(input.value.trim()==='')throw Error('Заполните все поля калькулятора.');
      return [name,Number(input.value)];
    }));
    const output=get('knowledgeExampleResult');
    try {
      const result=calculateKnowledgeExample({
        baseline:read('baseline'),current:read('current'),
      });
      output.textContent=[
        'CTR: '+percent(result.baseline.ctr)+' → '+percent(result.current.ctr)+
          ' (изменение '+delta(result.ctrRelativeChange)+').',
        'Конверсия: '+percent(result.baseline.cvr)+' → '+percent(result.current.cvr)+
          ' (изменение '+delta(result.cvrRelativeChange)+').',
        result.note,
      ].join('\n');
      output.dataset.error='false';
    }catch(e){
      output.textContent=e.message;
      output.dataset.error='true';
    }
  }
  function render(topicId){
    if(!Object.hasOwn(KNOWLEDGE_TOPICS,topicId))return;
    selected=topicId;
    const topic=KNOWLEDGE_TOPICS[topicId];
    for(const field of ['title','short','formula','plain','mechanism','business','rule','caveat','pitfall']){
      get('knowledge-'+field).textContent=topic[field];
    }
    get('knowledge-rule-version').textContent=KNOWLEDGE_RULE_VERSION;
    get('knowledge-related').replaceChildren();
    for(const id of topic.related){
      const related=KNOWLEDGE_TOPICS[id];
      const btn=document.createElement('button');
      btn.type='button';btn.className='knowledge-related-button';
      btn.dataset.knowledge=id;btn.textContent=related.title+' →';
      get('knowledge-related').appendChild(btn);
    }
    showExample();
  }
  function open(topicId){
    if(!Object.hasOwn(KNOWLEDGE_TOPICS,topicId))return;
    if(drawer.hidden)previousFocus=document.activeElement;
    render(topicId);
    drawer.hidden=false;
    backdrop.hidden=false;
    document.body.classList.add('knowledge-open');
    close.focus();
  }
  function dismiss(){
    if(drawer.hidden)return;
    drawer.hidden=true;backdrop.hidden=true;
    document.body.classList.remove('knowledge-open');
    if(previousFocus?.isConnected)previousFocus.focus();
    previousFocus=null;
  }
  document.addEventListener('click',e=>{
    const node=e.target.closest?.('[data-knowledge]');
    if(!node)return;
    e.preventDefault();
    open(node.dataset.knowledge);
  });
  close.addEventListener('click',dismiss);
  backdrop.addEventListener('click',dismiss);
  drawer.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();dismiss();return;}
    if(e.key!=='Tab')return;
    const focusables=[...drawer.querySelectorAll(
      'button:not([disabled]),a[href],input:not([disabled])',
    )].filter(el=>el.getClientRects().length>0);
    if(!focusables.length)return;
    const first=focusables[0],last=focusables.at(-1);
    if(e.shiftKey&&document.activeElement===first){
      e.preventDefault();last.focus();
    }else if(!e.shiftKey&&document.activeElement===last){
      e.preventDefault();first.focus();
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!drawer.hidden)dismiss();
  });
  drawer.querySelectorAll('.knowledge-calc-input').forEach(input=>{
    input.addEventListener('input',showExample);
  });
  get('knowledgeReset').addEventListener('click',()=>{
    const initial={
      'baseline-impressions':10000,'baseline-clicks':1000,
      'baseline-conversions':150,'current-impressions':10000,
      'current-clicks':300,'current-conversions':9,
    };
    for(const [id,value] of Object.entries(initial))
      get('knowledge-'+id).value=String(value);
    showExample();
  });
}
