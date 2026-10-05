const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

export const DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';

export function resolveOpenRouterApiKey(env = process.env) {
  return String(
    env.YAIS_AI
    || env.OPENROUTER_API_KEY
    || env.YAAI_OPENROUTER_API_KEY
    || '',
  ).trim();
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
  model = DEFAULT_JEV_MODEL,
  apiKey = resolveOpenRouterApiKey(),
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    throw new Error('OpenRouter API key is missing. Set YAIS_AI (preferred repo secret) or OPENROUTER_API_KEY.');
  }
  if (state == null || (typeof state === 'string' && !state.trim())) {
    throw new Error('Jev state is required.');
  }
  validateJevQuestions(questions);

  const response = await fetchImpl(OPENROUTER_DECISIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: String(model || DEFAULT_JEV_MODEL),
      state,
      questions,
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`OpenRouter Decisions API returned non-JSON HTTP ${response.status}`);
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(`OpenRouter Decisions API: ${detail}`);
  }

  if (!payload?.answers || typeof payload.answers !== 'object') {
    throw new Error('OpenRouter Decisions API response is missing answers.');
  }

  return payload;
}
