import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { DEFAULT_JEV_MODEL, resolveOpenRouterApiKey } from '../lib/jev.mjs';
import { transcriptChunks } from '../lib/youtube-transcripts.mjs';

const args = process.argv.slice(2);
function flag(name) {
  const direct = args.find((s) => s.startsWith(name + '='));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

if (!args.includes('--execute')) throw new Error('No model calls made. Add --execute after reviewing limits.');
const input = flag('--transcripts');
const output = flag('--out');
const profilePath = flag('--profile') || 'examples/evaluation-profiles/transcript-intelligence.json';
const limit = Number(flag('--limit') || 5);
const chars = Number(flag('--chunk-chars') || 5000);
const maxChunks = Number(flag('--max-chunks') || 12);
if (!input || !output) throw new Error('Pass --transcripts <JSON> --out <JSON>.');
if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('--limit must be 1–30.');
if (!Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 32) throw new Error('--max-chunks must be 1–32.');
if (!Number.isInteger(chars) || chars < 500 || chars > 12000) throw new Error('--chunk-chars must be 500–12000.');

const apiKey = resolveOpenRouterApiKey();
if (!apiKey) throw new Error('Set YAIS_AI or OPENROUTER_API_KEY.');
const data = JSON.parse(await fs.readFile(path.resolve(input), 'utf8'));
const profile = JSON.parse(await fs.readFile(path.resolve(profilePath), 'utf8'));
if (data.schemaVersion !== 1 || !Array.isArray(data.transcripts)) throw new Error('Invalid transcript evidence JSON.');

const items = [];
const sourceById = new Map();
for (const transcript of data.transcripts.filter((row) => row.status === 'ok').slice(0, limit)) {
  const chunks = transcriptChunks(transcript, chars, maxChunks);
  for (const chunk of chunks) {
    const id = transcript.contentId + '#chunk-' + chunk.index;
    sourceById.set(id, { transcript, chunk });
    items.push({
      id,
      meta: {
        contentId: transcript.contentId,
        videoId: transcript.videoId,
        url: transcript.url,
        title: transcript.title,
        language: transcript.language,
        textHash: transcript.textHash,
        chunkIndex: chunk.index,
        chunkCount: chunks.length,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
      },
      state: { title: transcript.title, language: transcript.language, transcriptExcerpt: chunk.text },
    });
  }
}
if (!items.length) throw new Error('No usable transcript chunks; import or fetch transcripts first.');
if (items.length > 300) throw new Error('Maximum 300 Jev calls per batch.');

const result = await evaluateItemsWithJev({
  items,
  profile,
  model: flag('--model') || process.env.YAAI_JEV_MODEL || DEFAULT_JEV_MODEL,
  apiKey,
  onProgress: ({ index, total, itemId, cost }) => console.error(`Transcript Jev ${index}/${total}: ${itemId} cost=${cost}`),
});

const byVideo = new Map();
for (const row of result.evaluations) {
  const original = sourceById.get(row.itemId);
  const videoId = row.meta.videoId;
  const group = byVideo.get(videoId) || {
    videoId, contentId: row.meta.contentId, title: row.meta.title,
    url: row.meta.url, chunkCount: 0, needsReview: false,
    signals: {}, evidence: [],
  };
  group.chunkCount++;
  group.needsReview ||= row.route.needsReview;
  for (const [id, answer] of Object.entries(row.answers || {})) {
    const slot = group.signals[id] || { type: answer.type, values: {}, maximumProbability: null };
    if (answer.type === 'noul') {
      if (answer.value != null) slot.maximumProbability = Math.max(slot.maximumProbability ?? 0, answer.value);
    } else {
      const key = String(answer.value);
      slot.values[key] = (slot.values[key] || 0) + 1;
    }
    group.signals[id] = slot;
  }
  if (Object.entries(row.answers).some(([name, answer]) => ['offer_present','pain_present','cta_present','funnel_present'].includes(name) && answer.value >= 0.7)) {
    group.evidence.push({
      chunkIndex: row.meta.chunkIndex, startSeconds: row.meta.startSeconds,
      endSeconds: row.meta.endSeconds,
      textPreview: original.chunk.text.slice(0, 260),
      note: 'Candidate evidence excerpt, not a validated extracted offer or CTA.',
    });
  }
  byVideo.set(videoId, group);
}
result.input = {
  type: 'youtube-transcript-evidence',
  source: data.source,
  generatedAt: data.generatedAt,
  evaluatedChunks: items.length,
  chunkChars: chars,
};
result.videoMap = [...byVideo.values()];

const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({
  saved: destination, videos: result.videoMap.length,
  chunks: result.summary.itemCount, review: result.summary.needsReviewCount,
  actualCostUsd: result.summary.totalCost,
  videoMap: result.videoMap.map((v) => ({
    videoId: v.videoId, title: v.title, signals: v.signals, evidenceCount: v.evidence.length,
  })),
}, null, 2));
