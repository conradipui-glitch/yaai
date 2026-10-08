# YouTube transcripts → Jev market signals

This is an **evidence enrichment layer**, not a new service. It links transcript records to existing YouTube `ContentItem.id` from a saved Distribution Evidence JSON and reuses the Jev evaluation layer.

## Why two transcript inputs

- **Local imports:** reliable path for your own `.txt`, `.md` (including the time-coded Markdown used in previous video research), `.srt`, `.vtt`.
- **Public-caption attempt:** optional `--fetch --execute` via `@hallelx/youtube-transcript`. It can be blocked by YouTube's datacenter/IP controls. Every failure is recorded as `blocked` or `unavailable`, not silently invented as an empty transcript.

Google's official captions.download API requires OAuth and permission to edit the video; a regular YouTube Data API key does not grant permission to download arbitrary creators' captions. The optional public-caption approach is unofficial and not guaranteed.

This version imports **existing speech-to-text transcripts or subtitles**; it does not decode video audio or do Whisper/ASR when captions are unavailable.

## 1. Obtain content IDs

Use an existing `youtube-evidence.json` from `youtube:collect` or the shared Distribution Evidence contract.

Each item requires a real 11-character YouTube `externalId`, e.g. `4mkUoy7PM5Q`.

## 2. Obtain transcripts

Save files in a local private directory named by video ID:

```text
/private/transcripts/
  4mkUoy7PM5Q.md
  AnotherId1.srt
  AnotherId2.vtt
```

Import local files, no API request:

```bash
npm run youtube:transcripts -- \
  --distribution /private/youtube-evidence.json \
  --input-dir /private/transcripts \
  --limit 10 \
  --out /private/transcript-evidence.json
```

Try public captions for files missing from that directory:

```bash
npm install
npm run youtube:transcripts -- \
  --distribution /private/youtube-evidence.json \
  --input-dir /private/transcripts \
  --fetch --execute \
  --languages ru,en \
  --limit 10 \
  --out /private/transcript-evidence.json
```

The source and per-video status are preserved. Output files are created without overwriting earlier results. Keep research evidence outside the public engine repo.

## 3. Jev structured evaluation

```bash
npm run transcript:evaluate -- \
  --transcripts /private/transcript-evidence.json \
  --profile examples/evaluation-profiles/transcript-intelligence.json \
  --limit 5 \
  --chunk-chars 5000 \
  --max-chunks 12 \
  --out /private/transcript-evaluation.json \
  --execute
```

This calls OpenRouter using `YAIS_AI`. It evaluates each chunk using:

- content role;
- presence of an **offer**;
- presence of an **audience pain**;
- presence of a **call to action**;
- presence of a **funnel transition**;
- monetization model;
- actionability.

The result contains a `videoMap` of counted decision signals and candidate time-linked excerpts. The original transcript remains in its source evidence file; the new evaluation file saves only short candidate previews, hashes, decisions and measured usage.

Important distinctions:

- Jev detects **whether** a signal may be present; it does **not** extract a verified exact offer, company name, CTA, destination URL, quote or reasoning.
- Different video chunks may choose different monetization roles; the map counts these and does not silently invent one dominant full-video fact.
- The maximum probability from chunks is a routing heuristic, not calibrated proof that the entire video contains a signal.
- To reconstruct an exact offer or a full funnel, a stronger generative model must subsequently examine the cited passages and validate them against the actual transcript.
- Public YouTube counters, creator sales claims, alleged earnings and market size are not evidence of real conversions or placement effectiveness.

## 4. Agent access

The saved `transcript-evaluation.json` is also compatible with `yaai_evaluation_evidence` via a workspace-relative path. That MCP tool **never calls OpenRouter**.

## Tests

```bash
npm run transcript:selftest
npm run transcript:smoke   # explicit one-call live smoke from a synthetic fixture; uses YAIS_AI
npm run check
```
