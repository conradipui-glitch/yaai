import {diagnoseJevProviders,getJevProvider,JEV_PROVIDER_IDS} from '../lib/jev-providers.mjs';
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
  console.log('Usage: npm run jev:provider -- --provider openrouter|typesafe [--model MODEL] [--require-key]\n'+
    'Read-only offline diagnostic. No network, no credential value, no API test, no cost.');
}else{
  const id=flag('--provider')||process.env.YAAI_JEV_PROVIDER||'openrouter';
  const model=flag('--model')||process.env.YAAI_JEV_MODEL||getJevProvider(id).defaultModel;
  const result=diagnoseJevProviders({provider:id,model});
  console.log(JSON.stringify({
    ...result,supportedProviders:JEV_PROVIDER_IDS,
    keySource:'environment-only',
  },null,2));
  if(args.includes('--require-key')&&!result.credentialPresent)process.exitCode=1;
}
