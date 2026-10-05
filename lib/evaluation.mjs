import crypto from 'node:crypto';

import { callJevDecision, DEFAULT_JEV_MODEL, validateJevQuestions } from './jev.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 4) {
  const number = finite(value);
  if (number == null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableString(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(canonicalize(value));
}

export function hashEvaluationState(state) {
  return crypto.createHash('sha256').update(stableString(state)).digest('hex');
}

export function normalizeJevAnswer(answer) {
  const type = String(answer?.type || '');
  if (type === 'choice') {
    const probabilities = answer?.probabilities && typeof answer.probabilities === 'object'
      ? answer.probabilities
      : {};
    return {
      type,
      value: answer.choice ?? null,
      confidence: round(answer.confidence),
      certainty: round(answer.confidence),
      probabilities,
    };
  }

  if (type === 'noul') {
    const probability = round(answer.noul);
    const certainty = probability == null ? null : round(Math.max(probability, 1 - probability));
    return {
      type,
      value: probability,
      confidence: null,
      certainty,
      probability,
    };
  }

  if (type === 'score') {
    return {
      type,
      value: round(answer.score),
      confidence: round(answer.confidence),
      certainty: round(answer.confidence),
      probabilities: answer?.probabilities && typeof answer.probabilities === 'object'
        ? answer.probabilities
        : {},
      legend: answer?.legend && typeof answer.legend === 'object' ? answer.legend : {},
    };
  }

  return {
    type: type || 'unknown',
    value: null,
    confidence: null,
    certainty: null,
    raw: answer,
  };
}

export function validateEvaluationProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Evaluation profile must be an object.');
  }
  if (!String(profile.id || '').trim()) throw new Error('Evaluation profile requires id.');
  validateJevQuestions(profile.questions);

  const threshold = Number(profile.reviewThreshold ?? 0.75);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('reviewThreshold must be between 0 and 1.');
  }
  if (profile.reviewQuestions != null && !Array.isArray(profile.reviewQuestions)) {
    throw new Error('reviewQuestions must be an array when present.');
  }
  return true;
}

function reviewDecision(answers, profile) {
  const threshold = Number(profile.reviewThreshold ?? 0.75);
  const selected = Array.isArray(profile.reviewQuestions) && profile.reviewQuestions.length
    ? profile.reviewQuestions
    : Object.keys(answers);

  const lowCertainty = selected
    .map((id) => ({ id, certainty: answers[id]?.certainty ?? null }))
    .filter((row) => row.certainty == null || row.certainty < threshold);

  return {
    threshold,
    needsReview: lowCertainty.length > 0,
    lowCertainty,
  };
}

export async function evaluateItemsWithJev({
  items,
  profile,
  model = profile?.model || DEFAULT_JEV_MODEL,
  apiKey,
  delayMs = 0,
  onProgress,
  callDecision = callJevDecision,
} = {}) {
  validateEvaluationProfile(profile);
  if (!Array.isArray(items) || !items.length) throw new Error('Evaluation items must be a non-empty array.');
  if (items.length > 1000) throw new Error('Maximum 1000 items per evaluation batch.');

  const generatedAt = new Date().toISOString();
  const evaluations = [];
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const itemId = String(item.id || '').trim();
    if (!itemId) throw new Error(`Evaluation item ${index + 1} is missing id.`);
    if (item.state == null) throw new Error(`Evaluation item ${itemId} is missing state.`);

    const payload = await callDecision({
      state: item.state,
      questions: profile.questions,
      model,
      apiKey,
    });

    const answers = Object.fromEntries(
      Object.entries(payload.answers || {}).map(([id, answer]) => [id, normalizeJevAnswer(answer)]),
    );
    const route = reviewDecision(answers, profile);
    const usage = payload.usage || {};
    const cost = finite(usage.cost) || 0;
    const inputTokens = finite(usage.input_tokens ?? usage.inputTokens) || 0;
    const outputTokens = finite(usage.output_tokens ?? usage.outputTokens) || 0;

    totalCost += cost;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;

    evaluations.push({
      itemId,
      meta: item.meta && typeof item.meta === 'object' ? item.meta : {},
      stateHash: hashEvaluationState(item.state),
      model: payload.model || model,
      provider: payload.provider || null,
      answers,
      route,
      usage: {
        cost,
        inputTokens,
        outputTokens,
      },
    });

    if (typeof onProgress === 'function') {
      onProgress({ index: index + 1, total: items.length, itemId, route, cost });
    }

    if (delayMs > 0 && index < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    schemaVersion: 1,
    source: 'openrouter-decisions',
    generatedAt,
    modelRequested: model,
    profile: {
      id: profile.id,
      name: profile.name || profile.id,
      reviewThreshold: Number(profile.reviewThreshold ?? 0.75),
      reviewQuestions: profile.reviewQuestions || null,
      questions: profile.questions,
    },
    summary: {
      itemCount: evaluations.length,
      needsReviewCount: evaluations.filter((row) => row.route.needsReview).length,
      totalCost: round(totalCost, 8),
      totalInputTokens,
      totalOutputTokens,
    },
    evaluations,
  };
}

export function summarizeEvaluationEvidence(dataset) {
  if (!dataset || Number(dataset.schemaVersion) !== 1 || !Array.isArray(dataset.evaluations)) {
    throw new Error('Invalid evaluation evidence dataset.');
  }

  const questionStats = {};
  for (const row of dataset.evaluations) {
    for (const [questionId, answer] of Object.entries(row.answers || {})) {
      const stats = questionStats[questionId] || {
        type: answer.type,
        count: 0,
        values: {},
        averageCertainty: 0,
        certaintyCount: 0,
      };
      stats.count += 1;
      const valueKey = String(answer.value);
      stats.values[valueKey] = (stats.values[valueKey] || 0) + 1;
      if (Number.isFinite(Number(answer.certainty))) {
        stats.averageCertainty += Number(answer.certainty);
        stats.certaintyCount += 1;
      }
      questionStats[questionId] = stats;
    }
  }

  for (const stats of Object.values(questionStats)) {
    stats.averageCertainty = stats.certaintyCount
      ? round(stats.averageCertainty / stats.certaintyCount)
      : null;
    delete stats.certaintyCount;
  }

  return {
    meta: {
      source: dataset.source,
      generatedAt: dataset.generatedAt,
      modelRequested: dataset.modelRequested,
      profileId: dataset.profile?.id || null,
      itemCount: dataset.evaluations.length,
      needsReviewCount: dataset.evaluations.filter((row) => row.route?.needsReview).length,
      totalCost: dataset.summary?.totalCost ?? null,
    },
    questionStats,
    evaluations: dataset.evaluations,
  };
}
