import {getJevProvider} from './jev-providers.mjs';

/**
 * Capabilities of this VERSION of YA AI, not claims about provider accounts.
 * No live request, credential access or file mutation.
 */
export function offlineCapabilityReport({provider='openrouter',credentialPresent=false}={}){
  const p=getJevProvider(provider);
  return {
    schemaVersion:1,
    provider:p.id,providerEndpoint:p.endpoint,model:p.defaultModel,
    checkedWithoutNetwork:true,liveAccountVerified:false,
    operations:[
      {id:'saved-evidence',available:true,requiresKey:false,
        note:'Offline research analysis, saved reports and read-only MCP.'},
      {id:'generic-jev-decisions',available:true,requiresKey:true,
        credentialConfigured:Boolean(credentialPresent),explicitExecuteRequired:true,
        note:'Choice/Noul/Score are implemented. Live provider access and price are NOT verified.'},
      {id:'seo-jev-review',available:true,requiresKey:true,
        credentialConfigured:Boolean(credentialPresent),explicitExecuteRequired:true,
        note:'Offline preparation and manual review; model run requires --execute.'},
      {id:'legacy-specialized-jev-routing',available:p.id==='openrouter',
        requiresKey:true,credentialConfigured:Boolean(credentialPresent),
        note:p.id==='openrouter'
          ? 'Some older specialized scripts still use OpenRouter only.'
          : 'Direct TypeSafe is not integrated into every legacy specialized script.'},
      {id:'mcp-paid-execution',available:false,requiresKey:false,
        note:'Existing MCP tools are read-only; no model calls can be launched by MCP.'},
      {id:'vps-authenticated-deploy',available:false,requiresKey:false,
        note:'TLS/auth/session/backup/remote access are not delivered by this installer.'},
      {id:'telegram-campaign-control',available:false,requiresKey:false,
        note:'Telegram management and live campaign writes are not implemented.'},
    ],
    note:'These are code capabilities only; not evidence of a working account, valid key, quota or price.',
  };
}
