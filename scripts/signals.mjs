import {listSignals,acknowledgeSignal} from '../lib/signal-inbox.mjs';
const args=process.argv.slice(2);
const command=args[0];
function flag(name){
  const inline=args.find(x=>x.startsWith(name+'='));
  if(inline)return inline.slice(name.length+1);
  const i=args.indexOf(name);
  if(i<0)return null;
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+name);
  return args[i+1];
}
const workspaceRoot=flag('--workspace')||process.env.YAAI_WORKSPACE;
const caseId=flag('--case');
if(!workspaceRoot||!caseId)
  throw Error('Specify --workspace and --case. Signal inbox is always scoped to ONE private case.');
let result;
if(command==='list'){
  result=await listSignals({
    workspaceRoot,caseId,
    limit:flag('--limit')===null?50:Number(flag('--limit')),
    includeAcknowledged:!args.includes('--unread-only'),
  });
}else if(command==='ack'){
  result=await acknowledgeSignal({workspaceRoot,caseId,signalId:flag('--id')});
}else{
  throw Error('Usage: npm run signals -- list --workspace PRIVATE_DIR --case CASE [--unread-only] [--limit 50] | ack --workspace PRIVATE_DIR --case CASE --id SIGNAL_ID. No network/API calls.');
}
console.log(JSON.stringify(result,null,2));
