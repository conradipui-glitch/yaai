import {diagnoseJevProviders,getJevProvider,JEV_PROVIDER_IDS} from '../lib/jev-providers.mjs';
import {resolveProjectJevSelection} from '../lib/setup-jev.mjs';
import {offlineCapabilityReport} from '../lib/provider-capabilities.mjs';
const args=process.argv.slice(2);
const flag=name=>{
  const inline=args.find(a=>a.startsWith(name+'='));
  if(inline)return inline.slice(name.length+1);
  const i=args.indexOf(name);
  if(i<0)return null;
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+name+' value');
  return args[i+1];
};
if(args.includes('--help')){
  console.log('Usage: npm run jev:provider -- [--workspace ROOT --case ID | --provider openrouter|typesafe] [--model MODEL] [--require-key]\n'+
    'Read-only offline diagnostic. No network, no credential value, no API test, no cost.');
}else{
  const selected=await resolveProjectJevSelection({
    workspaceRoot:flag('--workspace'),caseId:flag('--case'),
    provider:flag('--provider'),model:flag('--model'),
  });
  const id=selected?.profile.provider||flag('--provider')||process.env.YAAI_JEV_PROVIDER||'openrouter';
  const model=selected?.profile.model||flag('--model')||process.env.YAAI_JEV_MODEL||getJevProvider(id).defaultModel;
  const result=diagnoseJevProviders({provider:id,model});
  const displayed=selected?{
    ...result,
    credentialEnvironmentVariables:[selected.profile.credentialEnvVar],
    credentialPresent:selected.diagnostic.credentialPresent,
  }:result;
  console.log(JSON.stringify({
    ...displayed,supportedProviders:JEV_PROVIDER_IDS,
    keySource:selected?'private-project-profile/environment':'environment-only',
    caseId:selected?.profile.caseId||null,
    capabilities:offlineCapabilityReport({provider:id,credentialPresent:displayed.credentialPresent}),
  },null,2));
  if(args.includes('--require-key')&&!displayed.credentialPresent)process.exitCode=1;
}
