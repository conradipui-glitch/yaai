import {runMetricCheck} from '../lib/metric-rules.mjs';
const args=process.argv.slice(2);
const flag=name=>{
 const index=args.indexOf(name);
 if(index<0)return null;
 if(!args[index+1]||args[index+1].startsWith('--'))throw Error('Missing value for '+name);
 return args[index+1];
};
if(args.includes('--help')){
 console.log('Offline weekly ad metrics: npm run metrics:check -- --workspace PRIVATE_WORKSPACE --case CASE [--save]\n'+
 'Default: dry-run preview, no files written and no network. --save creates one immutable offline check record.');
}else{
 const workspaceRoot=flag('--workspace')||process.env.YAAI_WORKSPACE;
 const caseId=flag('--case');
 if(!workspaceRoot||!caseId)throw Error('Explicit workspace and case required.');
 const outcome=await runMetricCheck({workspaceRoot,caseId,save:args.includes('--save')});
 console.log(JSON.stringify(outcome,null,2));
}
