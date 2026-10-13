import {getJevProvider,resolveJevCredential,validateJevProviderModel} from './jev-providers.mjs';

export const DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';

export function resolveOpenRouterApiKey(env = process.env) {
  return resolveJevCredential('openrouter',env);
}

export function validateJevQuestions(questions) {
  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
    throw new Error('Jev questions must be an object keyed by question id.');
  }

  const entries = Object.entries(questions);
  if (!entries.length) throw new Error('Jev questions cannot be empty.');
  if (entries.length > 50) throw new Error('Jev question limit is 50 per request.');

  for (const [id, question] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(id)) {
      throw new Error(`Invalid Jev question id: ${id}`);
    }
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      throw new Error(`Jev question ${id} must be an object.`);
    }
    if (!['choice', 'noul', 'score'].includes(question.type)) {
      throw new Error(`Jev question ${id} has unsupported type: ${question.type}`);
    }
    if (!String(question.instructions || '').trim()) {
      throw new Error(`Jev question ${id} requires instructions.`);
    }

    if (question.type === 'choice') {
      const criteria = question.criteria;
      if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
        throw new Error(`Choice question ${id} requires criteria object.`);
      }
      const options = Object.entries(criteria);
      if (options.length < 2) throw new Error(`Choice question ${id} requires at least two options.`);
      for (const [key, description] of options) {
        if (!String(key).trim() || !String(description || '').trim()) {
          throw new Error(`Choice question ${id} has an empty option key or description.`);
        }
      }
    }

    if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10) {
        throw new Error(`Score question ${id} requires 2-10 ordered criteria levels.`);
      }
      if (question.criteria.some((value) => !String(value || '').trim())) {
        throw new Error(`Score question ${id} has an empty criterion.`);
      }
    }
  }

  return true;
}

export async function callJevDecision({
  state,
  questions,
  model,
  provider = 'openrouter',
  apiKey,
  fetchImpl = fetch,
} = {}) {
  const transport=getJevProvider(provider);
  const selectedModel=validateJevProviderModel(provider,model);
  const credential=apiKey===undefined?resolveJevCredential(provider):apiKey;
  if (!credential) {
    throw new Error(transport.label+' API key is missing. Configure one of: '+transport.credentialNames.join(', '));
  }
  if (state == null || (typeof state === 'string' && !state.trim())) {
    throw new Error('Jev state is required.');
  }
  validateJevQuestions(questions);

  const response = await fetchImpl(transport.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      state,
      questions,
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${transport.label} returned non-JSON HTTP ${response.status}`);
  }

  if (!response.ok) {
    // Never quote remote error text: it may echo credentials or private state.
    throw new Error(transport.label+' HTTP '+response.status+' (provider error content redacted)');
  }

  if (!payload?.answers || typeof payload.answers !== 'object') {
    throw new Error(transport.label+' response is missing answers.');
  }

  return payload;
}
