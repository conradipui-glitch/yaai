import assert from 'node:assert/strict';

import {
  evaluateItemsWithJev,
  hashEvaluationState,
  normalizeJevAnswer,
  summarizeEvaluationEvidence,
  validateEvaluationProfile,
} from '../lib/evaluation.mjs';
import {
  callJevDecision,
  DEFAULT_JEV_MODEL,
  resolveOpenRouterApiKey,
  validateJevQuestions,
} from '../lib/jev.mjs';

const questions = {
  fit: {
    type: 'choice',
    instructions: 'How well does this lead fit?',
    criteria: {
      high: 'Strong fit and explicit need',
      medium: 'Possible fit or incomplete evidence',
      low: 'Weak fit',
    },
  },
  active_need: {
    type: 'noul',
    instructions: 'Is there an explicit active need?',
  },
  urgency: {
    type: 'score',
    instructions: 'How urgent is the need?',
    criteria: [
      'No urgency',
      'Some interest without a near deadline',
      'Near-term need',
      'Immediate or hard-deadline need',
    ],
  },
};

assert.equal(validateJevQuestions(questions), true);
assert.throws(() => validateJevQuestions({ bad: { type: 'choice', instructions: 'x', criteria: { one: 'only' } } }));

const profile = {
  id: 'lead-fit-test',
  name: 'Lead fit test',
  reviewThreshold: 0.8,
  questions,
};
assert.equal(validateEvaluationProfile(profile), true);

const requests = [];
const fakeFetch = async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      model: 'typesafe/jev-1.13-20260917',
      provider: 'TypeSafe',
      answers: {
        fit: {
          type: 'choice',
          choice: 'high',
          probabilities: { high: 0.93, medium: 0.06, low: 0.01 },
          confidence: 0.91,
        },
        active_need: { type: 'noul', noul: 0.97 },
        urgency: {
          type: 'score',
          score: 2.1,
          legend: { 0: 'No urgency', 1: 'Some interest', 2: 'Near-term', 3: 'Immediate' },
          probabilities: { 0: 0, 1: 0.1, 2: 0.7, 3: 0.2 },
          confidence: 0.76,
        },
      },
      usage: { input_tokens: 400, output_tokens: 30, cost: 0.0000168 },
    }),
  };
};

const direct = await callJevDecision({
  apiKey: 'secret-test-key',
  state: { text: 'Нужен подрядчик в этом месяце' },
  questions,
  fetchImpl: fakeFetch,
});

assert.equal(direct.provider, 'TypeSafe');
assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://openrouter.ai/api/alpha/decisions');
assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-test-key');
assert.equal(requests[0].body.model, DEFAULT_JEV_MODEL);
assert.deepEqual(requests[0].body.questions, questions);

assert.equal(resolveOpenRouterApiKey({ YAIS_AI: ' a ', OPENROUTER_API_KEY: 'b' }), 'a');
assert.equal(resolveOpenRouterApiKey({ OPENROUTER_API_KEY: ' b ' }), 'b');

const choice = normalizeJevAnswer(direct.answers.fit);
assert.equal(choice.value, 'high');
assert.equal(choice.certainty, 0.91);

const noul = normalizeJevAnswer(direct.answers.active_need);
assert.equal(noul.value, 0.97);
assert.equal(noul.certainty, 0.97);

const score = normalizeJevAnswer(direct.answers.urgency);
assert.equal(score.value, 2.1);
assert.equal(score.certainty, 0.76);

const fakeCall = async ({ state }) => {
  const low = String(state.text || '').includes('неясно');
  return {
    model: 'typesafe/jev-1.13-test',
    provider: 'TypeSafe',
    answers: {
      fit: low
        ? { type: 'choice', choice: 'medium', probabilities: { high: 0.35, medium: 0.4, low: 0.25 }, confidence: 0.22 }
        : { type: 'choice', choice: 'high', probabilities: { high: 0.95, medium: 0.04, low: 0.01 }, confidence: 0.94 },
      active_need: { type: 'noul', noul: low ? 0.54 : 0.98 },
      urgency: {
        type: 'score',
        score: low ? 1.2 : 2.7,
        probabilities: low ? { 0: 0.1, 1: 0.6, 2: 0.3, 3: 0 } : { 0: 0, 1: 0, 2: 0.3, 3: 0.7 },
        confidence: low ? 0.55 : 0.88,
        legend: { 0: 'No urgency', 1: 'Interest', 2: 'Near-term', 3: 'Immediate' },
      },
    },
    usage: { inputTokens: 300, outputTokens: 20, cost: 0.0000126 },
  };
};

const dataset = await evaluateItemsWithJev({
  items: [
    { id: 'lead-1', state: { text: 'Ищем подрядчика сейчас' }, meta: { source: 'chat' } },
    { id: 'lead-2', state: { text: 'неясно, просто обсуждение' }, meta: { source: 'forum' } },
  ],
  profile,
  apiKey: 'unused-by-fake',
  callDecision: fakeCall,
});

assert.equal(dataset.summary.itemCount, 2);
assert.equal(dataset.summary.needsReviewCount, 1);
assert.equal(dataset.summary.totalInputTokens, 600);
assert.equal(dataset.evaluations[0].route.needsReview, false);
assert.equal(dataset.evaluations[1].route.needsReview, true);
assert.equal(dataset.evaluations[1].route.lowCertainty.length, 3);
assert.match(dataset.evaluations[0].stateHash, /^[a-f0-9]{64}$/);
assert.equal(
  hashEvaluationState({ b: 2, a: { y: 2, x: 1 } }),
  hashEvaluationState({ a: { x: 1, y: 2 }, b: 2 }),
);

const summary = summarizeEvaluationEvidence(dataset);
assert.equal(summary.meta.itemCount, 2);
assert.equal(summary.meta.needsReviewCount, 1);
assert.equal(summary.questionStats.fit.values.high, 1);
assert.equal(summary.questionStats.fit.values.medium, 1);

console.log('jev evaluation selftest: ok');
