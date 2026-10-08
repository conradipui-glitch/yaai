import crypto from 'node:crypto';
import { validateDistributionDataset } from './source-adapter.mjs';

export function videoIdFromContent(item) {
  if (item?.platform !== 'youtube' || item?.type !== 'video') return null;
  const id = String(item.externalId || '').trim();
  return /^[\w-]{11}$/.test(id) ? id : null;
}

function timeSeconds(raw) {
  const chunks = String(raw).trim().replace(',', '.').split(':').map(Number);
  if (chunks.some((n) => !Number.isFinite(n)) || chunks.length < 2 || chunks.length > 3) return null;
  return chunks.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseCaptionText(input, format = 'txt') {
  const raw = String(input || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (format === 'txt') {
    const text = raw.replace(/\s+/g, ' ').trim();
    return text ? [{ start: null, duration: null, text }] : [];
  }
  if (!['srt', 'vtt'].includes(format)) throw new Error('Supported transcript formats: txt, srt, vtt.');
  const cleaned = raw.replace(/^WEBVTT[^\n]*\n/i, '');
  const blocks = cleaned.split(/\n\s*\n/);
  const segments = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n').filter(Boolean);
    const index = lines.findIndex((line) => line.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})/);
    if (!match) continue;
    const start = timeSeconds(match[1]);
    const end = timeSeconds(match[2]);
    const text = lines.slice(index + 1).join(' ')
      .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    if (!text || start == null || end == null) continue;
    segments.push({ start, duration: Math.max(0, end - start), text });
  }
  return segments;
}

export function normalizeCaptionSegments(snippets) {
  return (snippets || []).map((s) => ({
    start: s.start == null ? null : Number(s.start),
    duration: s.duration == null ? null : Number(s.duration),
    text: String(s.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  })).filter((s) => s.text);
}

export function makeTranscriptRecord({ item, segments = [], source, language = null, status = 'ok', reason = null }) {
  const videoId = videoIdFromContent(item);
  if (!videoId) throw new Error('Transcript requires a YouTube video ContentItem with a valid 11-character ID.');
  const normalized = normalizeCaptionSegments(segments);
  const text = normalized.map((s) => s.text).join(' ').trim();
  const effectiveStatus = status === 'ok' && !text ? 'empty' : status;
  return {
    contentId: item.id,
    videoId,
    url: item.url,
    title: item.title,
    status: effectiveStatus,
    source,
    language,
    reason: effectiveStatus === 'ok' ? null : (reason || 'No usable transcript text'),
    segments: effectiveStatus === 'ok' ? normalized : [],
    text: effectiveStatus === 'ok' ? text : '',
    textHash: effectiveStatus === 'ok' ? crypto.createHash('sha256').update(text).digest('hex') : null,
  };
}

export function buildTranscriptEvidence(distribution, records) {
  validateDistributionDataset(distribution);
  if (distribution.platform !== 'youtube') throw new Error('Transcript input must be YouTube distribution evidence.');
  const allowed = new Set(distribution.contentItems.map((item) => item.id));
  const seen = new Set();
  for (const record of records) {
    if (!allowed.has(record.contentId)) throw new Error('Transcript is not linked to a known ContentItem.');
    if (seen.has(record.contentId)) throw new Error('Duplicate transcript for ContentItem.');
    seen.add(record.contentId);
  }
  return {
    schemaVersion: 1,
    source: 'yaai-youtube-transcripts',
    generatedAt: new Date().toISOString(),
    distribution: {
      source: distribution.source,
      generatedAt: distribution.generatedAt,
      platform: 'youtube',
    },
    summary: {
      attempted: records.length,
      usable: records.filter((r) => r.status === 'ok').length,
      unavailable: records.filter((r) => r.status !== 'ok').length,
    },
    transcripts: records,
  };
}

export function transcriptChunks(record, maxChars = 5000, maxChunks = 16) {
  if (record?.status !== 'ok' || !record.text) return [];
  const cap = Math.max(500, Math.min(12000, maxChars));
  const chunks = [];
  let current = '';
  let startTime = null;
  let endTime = null;
  const add = () => {
    if (!current.trim()) return;
    chunks.push({ index: chunks.length, text: current.trim(), startSeconds: startTime, endSeconds: endTime });
    current = '';
    startTime = null;
    endTime = null;
  };
  for (const segment of record.segments || [{ text: record.text, start: null, duration: null }]) {
    const pieces = String(segment.text || '').match(new RegExp(`.{1,${cap}}`, 'gs')) || [];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 1 > cap) add();
      if (startTime == null) startTime = segment.start ?? null;
      if (segment.start != null) endTime = segment.start + (segment.duration || 0);
      current += (current ? ' ' : '') + piece;
    }
  }
  add();
  if (chunks.length > maxChunks) throw new Error(`Transcript needs ${chunks.length} chunks, exceeding --max-chunks=${maxChunks}; increase limit deliberately or split input.`);
  return chunks;
}
