import path from 'node:path';
import {startVpsReadonly} from '../lib/vps-readonly.mjs';
const args=process.argv.slice(2);
const flag=name=>{
 const i=args.indexOf(name);
 if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Required flag '+name+' missing');
 return args[i+1];
};
const workspaceRoot=flag('--workspace');
const caseId=flag('--case');
const tokenFile=process.env.YAAI_VPS_TOKEN_FILE||
  (process.env.CREDENTIALS_DIRECTORY?
    path.join(process.env.CREDENTIALS_DIRECTORY,'read_token'):null);
if(!tokenFile)throw Error('Provide a read-only token via YAAI_VPS_TOKEN_FILE or systemd LoadCredential (no token in argv).');
const port=process.env.YAAI_VPS_READ_PORT===undefined?8790:Number(process.env.YAAI_VPS_READ_PORT);
const server=await startVpsReadonly({workspaceRoot,caseId,tokenFile,port});
console.log(JSON.stringify({
 service:'yaai-vps-readonly',bind:'127.0.0.1',
 port:server.address().port,caseId,paidApiCallsAllowed:false,
 writeActionsAllowed:false,remoteMcpEnabled:false,
 note:'This is only a loopback API. Configure external HTTPS/authenticated ingress separately.',
}));
