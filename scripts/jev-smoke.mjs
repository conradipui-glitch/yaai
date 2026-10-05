import { callJevDecision, DEFAULT_JEV_MODEL, resolveOpenRouterApiKey } from '../lib/jev.mjs';

const apiKey = resolveOpenRouterApiKey();
if (!apiKey) throw new Error('YAIS_AI / OPENROUTER_API_KEY is missing.');

const result = await callJevDecision({
  apiKey,
  model: process.env.YAAI_JEV_MODEL || DEFAULT_JEV_MODEL,
  state: 'Компания пишет: нужен подрядчик для внедрения AI-автоматизации отдела продаж в ближайший месяц.',
  questions: {
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
});

console.log(JSON.stringify({
  ok: true,
  model: result.model,
  provider: result.provider,
  answerTypes: Object.fromEntries(Object.entries(result.answers || {}).map(([id, answer]) => [id, answer.type])),
  usage: result.usage || {},
}, null, 2));
