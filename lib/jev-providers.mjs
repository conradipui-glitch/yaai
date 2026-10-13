/**
 * Verified Jev HTTP transports. URLs are fixed, never read from user input
 * (no SSRF or accidental credential forwarding to custom endpoints).
 * We do not save credentials or perform network-based "health checks".
 */
const CATALOG = Object.freeze({
  openrouter: Object.freeze({
    id:'openrouter',label:'OpenRouter Decisions',
    endpoint:'https://openrouter.ai/api/alpha/decisions',
    defaultModel:'typesafe/jev-1.13',
    credentialNames:Object.freeze(['YAIS_AI','OPENROUTER_API_KEY','YAAI_OPENROUTER_API_KEY']),
    responseSource:'openrouter-decisions',
  }),
  typesafe: Object.freeze({
    id:'typesafe',label:'TypeSafe System One',
    endpoint:'https://api.typesafe.ai/v1/systemone',
    defaultModel:'jev-1.13.0',
    credentialNames:Object.freeze(['TYPESAFE_API_KEY','YAAI_TYPESAFE_API_KEY']),
    responseSource:'typesafe-systemone',
  }),
});
export const JEV_PROVIDER_IDS=Object.freeze(Object.keys(CATALOG));

export function getJevProvider(id='openrouter') {
  if(!Object.hasOwn(CATALOG,id)) {
    throw Error('Unsupported Jev provider. Supported: '+JEV_PROVIDER_IDS.join(', '));
  }
  return CATALOG[id];
}
export function validateJevProviderModel(provider,model){
  const p=getJevProvider(provider),m=String(model??p.defaultModel).trim();
  const good=p.id==='openrouter'
    ? /^(?:~?typesafe\/jev-[a-zA-Z0-9._-]+)$/.test(m)
    : /^jev-[a-zA-Z0-9._-]+$/.test(m);
  if(!good)throw Error('Jev model ID does not match provider '+p.id+'; see provider doctor.');
  return m;
}
export function resolveJevCredential(provider='openrouter',env=process.env) {
  const config=getJevProvider(provider);
  for(const key of config.credentialNames){
    if(typeof env?.[key]==='string'&&env[key].trim())return env[key].trim();
  }
  return '';
}
export function diagnoseJevProviders({provider='openrouter',model,env=process.env}={}) {
  const config=getJevProvider(provider);
  const effectiveModel=validateJevProviderModel(provider,model);
  return {
    provider:config.id,label:config.label,endpoint:config.endpoint,
    model:effectiveModel,credentialEnvironmentVariables:[...config.credentialNames],
    credentialPresent:Boolean(resolveJevCredential(provider,env)),
    capability:['choice','noul','score'],
    status:'configuration_only',
    networkCalled:false,paidRequests:0,
    keyValidatedByProvider:false,modelAvailabilityVerified:false,
    priceVerified:false,
    note:'No credential, quota, live model, billing or API compatibility test has been performed.',
  };
}
