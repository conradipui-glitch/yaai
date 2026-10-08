import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJevCheckpointStore, prepareJevCheckpoints } from '../lib/jev-checkpoints.mjs';

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


const missingUsage = await evaluateItemsWithJev({
  items: [{id:'missing-cost',state:{text:'test missing cost'}}],
  profile,apiKey:'fixture',
  callDecision:async()=>({
    model:'fixture',answers:{
      fit:{type:'choice',choice:'high',confidence:null},
      active_need:{type:'noul',noul:0.8},
      urgency:{type:'score',score:2,confidence:0.9},
    },
    usage:{ inputTokens:11,outputTokens:5,cost:null },
  }),
});
assert.equal(missingUsage.evaluations[0].usage.cost,null);
assert.equal(missingUsage.summary.totalCost,null);
assert.equal(missingUsage.summary.measuredCostSubtotal,0);
assert.equal(missingUsage.summary.missingCostCount,1);
assert.equal(missingUsage.summary.costComplete,false);
const noCertainty = summarizeEvaluationEvidence(missingUsage);
assert.equal(noCertainty.questionStats.fit.averageCertainty,null);

const trulyFree=await evaluateItemsWithJev({
  items:[{id:'free',state:{text:'test measured zero cost'}}],
  profile,apiKey:'fixture',
  callDecision:async()=>({
    model:'fixture',answers:{
      fit:{type:'choice',choice:'high',confidence:0.98},
      active_need:{type:'noul',noul:0.9},
      urgency:{type:'score',score:2,confidence:0.9},
    },
    usage:{cost:0,input_tokens:0,output_tokens:0},
  }),
});
assert.equal(trulyFree.summary.totalCost,0);
assert.equal(trulyFree.summary.missingCostCount,0);


const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-jev-resume-'));
try {
  const checkpoint = createJevCheckpointStore(path.join(directory, 'result.json.jev-checkpoints'));
  const batch = [
    { id: 'resume-a', state: { text: 'first' }, meta: { source: 'fixture' } },
    { id: 'resume-b', state: { text: 'second' }, meta: { source: 'fixture' } },
    { id: 'resume-c', state: { text: 'third' }, meta: { source: 'fixture' } },
  ];
  let failed = true;
  let attempted = 0;
  const decision = async ({ state }) => {
    attempted++;
    if (failed && state.text === 'second') throw new Error('simulated outage');
    return fakeCall({ state });
  };
  await assert.rejects(
    evaluateItemsWithJev({ items: batch, profile, checkpoint, callDecision: decision }),
    /simulated outage/,
  );
  assert.equal(attempted, 2);
  assert.equal((await fs.readdir(checkpoint.root)).filter(f => f.endsWith('.json')).length, 1);
  failed = false;
  const resumed = await evaluateItemsWithJev({
    items: batch, profile, checkpoint, callDecision: decision,
  });
  assert.equal(attempted, 4, 'only the remaining two decisions should be paid');
  assert.equal(resumed.summary.itemCount, 3);
  assert.equal(resumed.summary.reusedCount, 1);
  assert.equal(resumed.summary.newlyEvaluatedCount, 2);
  assert.equal(resumed.summary.totalCost, 0.0000378);
  assert.equal(resumed.summary.newMeasuredCostSubtotal, 0.0000252);
  const allCached = await evaluateItemsWithJev({
    items: batch, profile, checkpoint, callDecision: async () => {
      throw new Error('cached batch must never call the API');
    },
  });
  assert.equal(allCached.summary.reusedCount, 3);
  assert.equal(allCached.summary.newlyEvaluatedCount, 0);
  assert.equal(allCached.summary.newMeasuredCostSubtotal, 0);
  assert.deepEqual(allCached.evaluations, resumed.evaluations);
  const updated = await evaluateItemsWithJev({
    items: [{ ...batch[0], state: { text: 'changed evidence' } }, ...batch.slice(1)],
    profile, checkpoint, callDecision: decision,
  });
  assert.equal(updated.summary.reusedCount, 2);
  assert.equal(updated.summary.newlyEvaluatedCount, 1);
  const otherModel = await evaluateItemsWithJev({
    items: batch, profile, model: 'typesafe/different-snapshot',
    checkpoint, callDecision: decision,
  });
  assert.equal(otherModel.summary.reusedCount, 0, 'a model change invalidates all cached decisions');
  assert.equal(otherModel.summary.newlyEvaluatedCount, 3);
  const differentProfile = await evaluateItemsWithJev({
    items: batch, profile: { ...profile, reviewThreshold: 0.81 },
    checkpoint, callDecision: decision,
  });
  assert.equal(differentProfile.summary.reusedCount, 0, 'a profile change invalidates cached decisions');

  const duplicateItems = [batch[0], { ...batch[0], state: { text: 'another' } }];
  await assert.rejects(evaluateItemsWithJev({
    items: duplicateItems, profile, checkpoint, callDecision: () => {
      throw new Error('paid call must not happen');
    },
  }), /Duplicate evaluation item ID/);

  const existingOutput = path.join(directory, 'already.json');
  await fs.writeFile(existingOutput, '{}');
  await assert.rejects(prepareJevCheckpoints({
    outputPath: existingOutput,
  }), /Refusing to spend on an existing output file/);
  await assert.rejects(prepareJevCheckpoints({
    outputPath: path.join(directory, 'same.json'),
    checkpointDir: path.join(directory, 'same.json'),
  }), /directory must be separate/);

  const files = (await fs.readdir(checkpoint.root)).filter(f => f.endsWith('.json'));
  await fs.writeFile(path.join(checkpoint.root, files[0]), 'invalid-json');
  await assert.rejects(evaluateItemsWithJev({
    items: batch, profile, checkpoint, callDecision: () => {
      throw new Error('API must not run on corrupt checkpoint');
    },
  }), /Corrupt Jev checkpoint JSON/);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}

console.log('jev evaluation selftest: ok (includes interrupted/resumed jobs, invalidation, output guards)');
