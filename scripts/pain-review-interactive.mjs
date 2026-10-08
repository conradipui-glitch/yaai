import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PAIN_CATEGORIES } from '../lib/pain-discovery.mjs';

const args=process.argv.slice(2);
function flag(name) {
  const direct=args.find(s=>s.startsWith(name+'='));
  const index=args.indexOf(name);
  return direct ? direct.slice(name.length+1) : index<0 ? null : args[index+1];
}
const filename=flag('--review');
const reviewer=String(flag('--reviewer')||'').trim();
if(!filename||!reviewer)throw new Error('Usage: npm run pain:review:interactive -- --review /private/pain-review.json --reviewer analyst');
const target=path.resolve(filename);
const queue=JSON.parse(await fs.readFile(target,'utf8'));
if(queue.source!=='yaai-pain-human-review'||!Array.isArray(queue.items))throw new Error('Expected a Pain Review queue.');
const rl=createInterface({input,output});
const categories=Object.entries(PAIN_CATEGORIES).filter(([id])=>id!=='none');
async function askBool(question) {
  while(true){
    const answer=(await rl.question(question+' [д/н/п=пропустить/в=выход]: ')).trim().toLowerCase();
    if(['д','y','yes','да'].includes(answer))return true;
    if(['н','n','no','нет'].includes(answer))return false;
    if(['п','s','skip'].includes(answer))return null;
    if(['в','q','quit','exit'].includes(answer))return 'quit';
    console.log('Ответ: д, н, п или в.');
  }
}
async function save() {
  const staging=target+'.new';
  await fs.writeFile(staging,JSON.stringify(queue,null,2)+'\n',{mode:0o600});
  await fs.rename(staging,target);
}
try {
  let answered=0;
  for(const [index,row] of queue.items.entries()){
    if(row.label?.isPain!==null && row.label?.isPain!==undefined)continue;
    console.log('\n'+'='.repeat(70));
    console.log((index+1)+'/'+queue.items.length+' | '+row.evidence.kind);
    console.log('Запрос: '+(row.evidence.query||'—'));
    console.log('Заголовок: '+(row.evidence.title||'—'));
    console.log('Текст: '+(row.evidence.excerpt||'—'));
    console.log('Ссылка: '+(row.evidence.url||'нет; поисковая фраза Wordstat'));
    console.log('Судим по доступному свидетельству: рекламная формулировка не равна жалобе клиента.');
    const isPain=await askBool('В тексте есть конкретная проблема / неудовлетворённая потребность?');
    if(isPain==='quit')break;
    if(isPain===null)continue;
    let category=null,evidenceSupported=false;
    if(isPain){
      console.log(categories.map(([id,name],i)=>(i+1)+'. '+name+' ('+id+')').join('\n'));
      while(true){
        const raw=(await rl.question('Категория, номер: ')).trim();
        const n=Number(raw);
        if(Number.isInteger(n) && n>=1 && n<=categories.length){category=categories[n-1][0];break;}
        console.log('Введите номер из списка.');
      }
      const supported=await askBool('Текст сам по себе подтверждает именно эту боль?');
      if(supported==='quit')break;
      if(supported===null)continue;
      evidenceSupported=supported;
    }
    const notes=await rl.question('Короткая заметка (необязательно): ');
    row.label={isPain,category,evidenceSupported,reviewer,notes:notes.trim()};
    await save();
    answered++;
    console.log('Сохранено. Пройдено за этот сеанс: '+answered);
  }
  console.log('\nГотово. Размечено всего: '+queue.items.filter(x=>typeof x.label?.isPain==='boolean').length+'/'+queue.items.length);
  console.log('Файл: '+target);
} finally { rl.close(); }
