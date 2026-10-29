// Browser UI logic smoke with a minimal DOM fixture; no network or browser install.
// This is NOT a rendered-browser/visual accessibility test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../tools/operator-review/',import.meta.url);
const [html,css,script,raw]=await Promise.all([
 fs.readFile(new URL('index.html',root),'utf8'),
 fs.readFile(new URL('review.css',root),'utf8'),
 fs.readFile(new URL('review.js',root),'utf8'),
 fs.readFile(new URL('../playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json',import.meta.url),'utf8')
]);
for(const id of ['blind-input','review-input','workspace','case-list','case-title','sources',
 'observations','decision-choices','source-check','reason','alternative','next-check',
 'proposed-action','save-case','save-review','prev-case','next-case','export-review',
 'reviewer-alias','human','independent','blind-confirm','finish-status','case-error']){
 assert.ok(html.includes('id="'+id+'"'),'Missing HTML control '+id);
}
assert.ok(html.includes('src="./review.js"')&&html.includes('href="./review.css"'),
 'Local UI must use local assets');
assert.ok(!/<script[^>]*src=["']https?:/i.test(html),'Disallow remote scripts');
assert.ok(css.length>1000,'Missing UI styles');
assert.ok(!script.includes('.innerHTML')&&!script.includes('eval('),
 'Avoid HTML injection/executable text from untrusted sources');
assert.ok(!/fetch\s*\(/.test(script) && !/localStorage|sessionStorage/.test(script),
 'No automatic source network calls or browser storage');
const dataset=JSON.parse(raw);
const sha256=async()=>{const {createHash}=await import('node:crypto');return createHash('sha256').update(raw).digest('hex')};
const blind={
 source:'yaai-p0-b4-blind-pack',
 datasetSha256:await sha256(),
 cases:dataset.cases.map(c=>({
 id:c.id,caseId:c.caseId,origin:c.origin,niche:c.niche,region:c.region,
 prospect:c.prospect,
 sources:c.sources,
 observations:c.observations
 }))
};
class Node {
 constructor(tag='div'){this.tag=tag.toUpperCase();this.children=[];this.attrs={};
   this.events=new Map();this.style={};this.value='';this.checked=false;this.hidden=false;this.disabled=false;
   this.type='';this.name='';this.className='';this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;}
 append(...children){this.children.push(...children);}
 appendChild(x){this.children.push(x);return x;}
 replaceChildren(...children){this.children=[...children];}
 remove(){}
 addEventListener(n,fn){this.events.set(n,fn);}
 async trigger(n,data={}){const fn=this.events.get(n);assert.ok(fn,'Missing event '+n+' '+this.tag);return await fn(data);}
 querySelectorAll(selector){
   const nodes=[];
   const visit=node=>{for(const c of node.children)if(c instanceof Node){nodes.push(c);visit(c)}};
   visit(this);
   const isChecked=selector.endsWith(':checked');
   const attr=selector.match(/^input\[([^\]]+)\]/)?.[1];
   assert.ok(attr,'Unsupported test selector: '+selector);
   return nodes.filter(n=>n.tag==='INPUT'&&
     (attr.startsWith('name=')?n.name===attr.slice(6,-1):Object.hasOwn(n.attrs,attr))&&
     (!isChecked||n.checked));
 }
 click(){if(this.tag==='A')downloaded.push(this.href);}
}
const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(x=>[x[1],new Node()]));
const downloaded=[],blobs=new Map();let nextUrl=0;
const document={
 getElementById:id=>ids.get(id)||null,
 createElement:tag=>new Node(tag),
 body:new Node('body')
};
const context={
 document,window:{addEventListener(){}},URL:class MockUrl extends URL{
  static createObjectURL(blob){const id='blob:test-'+(++nextUrl);blobs.set(id,blob);return id;}
  static revokeObjectURL(){}
 },Blob,Date,console,Set,Map,JSON,Error,
 setTimeout(){},fetch(){throw Error('Unexpected network call');}
};
vm.runInNewContext(script,context,{filename:'review.js'});
const file=contents=>({size:new TextEncoder().encode(contents).length,text:async()=>contents});
await ids.get('blind-input').trigger('change',{target:{files:[file(JSON.stringify(dataset))]}});
assert.ok(ids.get('load-status').textContent.includes('Неверный пакет'),
 'Original model-labelled dataset must not be accepted as blind pack');
await ids.get('blind-input').trigger('change',{target:{files:[file(JSON.stringify(blind))]}});
assert.equal(ids.get('workspace').hidden,false);
assert.equal(ids.get('progress-count').textContent,'0 / 19');
const choices=ids.get('decision-choices').querySelectorAll('input[name="decision"]');
const positive=choices.find(x=>x.value==='propose_draft');positive.checked=true;
for(const c of ids.get('observations').querySelectorAll('input[data-evidence]:checked'))c.checked=false;
const ev=ids.get('observations').querySelectorAll('input[data-evidence]');
assert.equal(ev.length,2);
for(const c of ev)c.checked=true;
ids.get('reason').value='Наблюдаемая проблема: конкретная ссылка возвращает 404.';
ids.get('alternative').value='Возможен работающий альтернативный способ обращения.';
ids.get('next-check').value='Повторно проверить HTTP-путь и пользовательскую навигацию.';
ids.get('proposed-action').value='Проверить и исправить ссылку заявки.';
await ids.get('save-case').trigger('click');
assert.equal(ids.get('progress-count').textContent,'1 / 19');
await ids.get('export-review').trigger('click');
assert.equal(downloaded.length,1);
const saved=JSON.parse(await blobs.get(downloaded[0]).text());
assert.equal(saved.entries.length,1);
assert.deepEqual([...saved.entries[0].evidenceIds],['a','b']);
assert.equal(saved.entries[0].status,'propose_draft');
assert.equal(saved.reviewer.isHuman,false,'Never prefill human attestation');
assert.equal(saved.reviewer.blindedUntilSubmission,false,'Never prefill blind attestation');
await ids.get('review-input').trigger('change',{target:{files:[file(JSON.stringify(saved))]}});
assert.equal(ids.get('progress-count').textContent,'1 / 19');
await ids.get('next-case').trigger('click');
assert.ok(ids.get('case-title').textContent.includes('Магазин'));
console.log('P0-B.4 reviewer UI DOM contract smoke: PASS (import, no-leak, decisions, save, export, resume, navigation)');
console.log('Rendered-browser/visual accessibility QA: NOT RUN; independent human review: NOT RUN');
