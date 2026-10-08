import fs from 'node:fs/promises';
import path from 'node:path';
import { buildTranscriptEvidence, makeTranscriptRecord, normalizeCaptionSegments, parseCaptionText, videoIdFromContent } from '../lib/youtube-transcripts.mjs';
import { validateDistributionDataset } from '../lib/source-adapter.mjs';

const args = process.argv.slice(2);
function flag(name) {
  const direct = args.find((s) => s.startsWith(name + '='));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const inputPath = flag('--distribution');
const output = flag('--out');
const inputDir = flag('--input-dir');
const live = args.includes('--fetch');
const execute = args.includes('--execute');
const limit = Number(flag('--limit') || 10);
const languages = String(flag('--languages') || 'ru,en').split(',').map((s) => s.trim()).filter(Boolean);

if (!inputPath || !output) throw new Error('Pass --distribution saved-youtube.json and --out transcript-evidence.json.');
if (!inputDir && !live) throw new Error('Provide --input-dir with local .txt/.srt/.vtt files or explicit --fetch --execute.');
if (live && !execute) throw new Error('Live YouTube transcript fetching requires --fetch --execute.');
if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('--limit must be 1–30.');
if (!languages.length) throw new Error('At least one transcript language is required.');

const distribution = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
validateDistributionDataset(distribution);
if (distribution.platform !== 'youtube') throw new Error('Expected YouTube distribution evidence.');

const videos = distribution.contentItems.filter(videoIdFromContent).slice(0, limit);
if (!videos.length) throw new Error('No eligible YouTube ContentItem video IDs found.');

let api;
if (live) {
  const { YouTubeTranscriptApi } = await import('@hallelx/youtube-transcript');
  api = new YouTubeTranscriptApi();
}

const records = [];
for (const item of videos) {
  const id = videoIdFromContent(item);
  let record;
  if (inputDir) {
    for (const ext of ['vtt', 'srt', 'txt']) {
      const candidate = path.join(path.resolve(inputDir), id + '.' + ext);
      try {
        const raw = await fs.readFile(candidate, 'utf8');
        record = makeTranscriptRecord({ item, segments: parseCaptionText(raw, ext), source: 'local-' + ext });
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  if (!record && live) {
    try {
      const data = await api.fetch(id, { languages });
      const segments = normalizeCaptionSegments(Array.from(data));
      record = makeTranscriptRecord({
        item,
        segments,
        source: 'youtube-public-captions-unofficial',
        language: data.languageCode || null,
      });
    } catch (error) {
      const message = String(error?.name || error?.message || 'unknown');
      const status = /RequestBlocked|IpBlocked|PoToken|TooManyRequests/i.test(message) ? 'blocked' : 'unavailable';
      record = makeTranscriptRecord({ item, source: 'youtube-public-captions-unofficial', status, reason: message.slice(0, 180) });
    }
  }

  if (!record) record = makeTranscriptRecord({ item, source: 'local-files', status: 'missing', reason: 'No matching <videoId>.txt/.srt/.vtt file' });
  records.push(record);
  console.error(`Transcript ${id}: ${record.status} (${record.text.length} chars)`);
}

const result = buildTranscriptEvidence(distribution, records);
const destination = path.resolve(output);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ saved: destination, ...result.summary, source: result.source }, null, 2));
