import path from 'node:path';
import readline from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {setupWorkspace,inspectSetup} from '../lib/setup.mjs';
import {ENGINE_ROOT} from '../lib/workspace.mjs';

const args=process.argv.slice(2);
function flag(name){
  const inline=args.find(x=>x.startsWith(name+'='));
  if(inline)return inline.slice(name.length+1);
  const i=args.indexOf(name);
  if(i<0)return null;
  const next=args[i+1];
  if(!next||next.startsWith('--'))throw Error('Missing value for '+name);
  return next;
}
const has=name=>args.includes(name);
const usage=[
  'YA AI Local / Harness-first setup (offline, no secrets)',
  '',
  'Interactive: npm run setup',
  'With flags: npm run setup -- --mode local|harness --workspace /private/project --case project-seo [--name "Project"] [--prefix project]',
  'Preview: npm run setup -- --dry-run --mode harness --workspace DIR --case ID',
  'Check: npm run setup -- --check --mode harness --workspace DIR --case ID',
  '',
  'local creates private project storage and blank templates.',
  'harness also creates a generic private MCP stdio client config.',
  'No provider key is requested, stored or tested. A main LLM API is optional.',
].join('\n');
if(has('--help')||has('-h')) {
  console.log(usage);
} else {
  let mode=flag('--mode'),workspaceRoot=flag('--workspace'),caseId=flag('--case');
  let resultPrefix=flag('--prefix'),projectName=flag('--name');
  const check=has('--check'),dryRun=has('--dry-run');
  if(check&&dryRun)throw Error('Choose either --check or --dry-run');
  const need=!(mode&&workspaceRoot&&caseId);
  if(need&&!input.isTTY)throw Error('Non-interactive mode requires --mode, --workspace and --case.\n'+usage);
  if(need){
    console.log('\nYA AI · Мастер локальной установки\n');
    console.log('Никакие API не вызываются. Укажи частную папку проекта вне репозитория.');
    const rl=readline.createInterface({input,output});
    try{
      const ask=async (message,current)=> {
        const answer=(await rl.question(message)).trim();
        return answer||current;
      };
      mode=mode||await ask('Режим (local / harness) [local]: ','local');
      workspaceRoot=workspaceRoot||await ask('Абсолютный или относительный путь рабочей папки: ','');
      caseId=caseId||await ask('ID проекта (например roof-omsk): ','');
      projectName=projectName||await ask('Название проекта ['+caseId+']: ',caseId);
      resultPrefix=resultPrefix||await ask('Префикс выходных файлов ['+caseId+']: ',caseId);
    } finally{rl.close();}
  }
  if(Number(process.versions.node.split('.')[0])<20)throw Error('Node.js >=20 required');
  const params={mode,workspaceRoot,caseId,resultPrefix,projectName};
  const outcome=check?await inspectSetup(params):
    await setupWorkspace({...params,dryRun});
  console.log(JSON.stringify({
    ...outcome,
    engineRoot:path.resolve(ENGINE_ROOT),
    safety:'No network/API calls, no API credentials collected, no global LLM required.',
  },null,2));
  if(check&&!outcome.ready)process.exitCode=1;
}
