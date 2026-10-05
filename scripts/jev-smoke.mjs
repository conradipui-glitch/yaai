import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { DEFAULT_JEV_MODEL, resolveOpenRouterApiKey } from '../lib/jev.mjs';

const apiKey = resolveOpenRouterApiKey();
if (!apiKey) throw new Error('YAIS_AI / OPENROUTER_API_KEY is missing.');

const dataset = await evaluateItemsWithJev({
  apiKey,
  model: process.env.YAAI_JEV_MODEL || DEFAULT_JEV_MODEL,
  profile: {
    id: 'live-smoke',
    name: 'Live smoke',
    reviewThreshold: 0.7,
    questions: {
      fit: {
        type: 'choice',
        instructions: 'How well does this candidate match an AI automation service offer?',
        criteria: {
          high_fit: 'Explicit need for AI automation and a near-term implementation intent',
          possible_fit: 'Relevant interest but weak or incomplete buying intent',
          not_fit: 'No meaningful fit with an AI automation service offer'
        },
      },
      active_need: {
        type: 'noul',
        instructions: 'Есть ли в сообщении явная активная потребность в услуге или подрядчике?',
      },
      urgency: {
        type: 'score',
        instructions: 'Насколько срочно автору требуется решение?',
        criteria: [
          'Срочность не указана или задача отдалённая',
          'Есть интерес, но без ближайшего срока',
          'Нужна реализация в ближайшие недели или месяц',
          'Нужна реализация немедленно или есть жёсткий близкий дедлайн'
        ],
      },
    },
  },
  items: [
    {
      id: 'smoke-lead',
      state: {
        targetOffer: 'AI automation service',
        text: 'Компания пишет: нужен подрядчик для внедрения AI-автоматизации отдела продаж в ближайший месяц.'
      },
    },
  ],
});

const row = dataset.evaluations[0];
for (const [id, expected] of Object.entries({ fit: 'choice', active_need: 'noul', urgency: 'score' })) {
  if (row.answers[id]?.type !== expected) {
    throw new Error(`Unexpected Jev answer type for ${id}: ${row.answers[id]?.type}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  model: row.model,
  provider: row.provider,
  answers: Object.fromEntries(
    Object.entries(row.answers).map(([id, answer]) => [id, {
      type: answer.type,
      value: answer.value,
      certainty: answer.certainty,
    }]),
  ),
  route: row.route,
  usage: row.usage,
  totalCost: dataset.summary.totalCost,
}, null, 2));
