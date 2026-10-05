# Telegram distribution evidence

The Telegram adapter is a read-only research collector for public channels. It uses an authenticated Telegram **user session** over MTProto through [Teleproto](https://github.com/sanyok12345/teleproto).

It does not send messages, join channels automatically, manage contacts, or expose live Telegram actions through MCP.

## Why a user session

Telegram's Bot API is intentionally limited for broad public-channel research. MTProto gives a normal Telegram client access to public channel history and public counters that the authenticated account can read.

Create an application at `https://my.telegram.org/apps` and keep:

```text
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

Do not commit either credential.

## One-time local authorization

Install dependencies first:

```bash
npm install
```

Then authenticate on a trusted local machine:

```bash
npm run telegram:auth -- \
  --out /private/telegram.session \
  --execute
```

The command asks for the phone number, Telegram login code, and 2FA password when enabled. It writes the resulting StringSession to a mode-0600 file and does **not** print the session value.

Treat that file like an active login credential. Never commit, upload, paste into chat, or store it in a public CI artifact.

## Collect public channels

```bash
npm run telegram:collect -- \
  --channels "channel_one,channel_two" \
  --research-queries "AI заработок,автоматизация бизнеса" \
  --limit 50 \
  --session-file /private/telegram.session \
  --out /private/telegram-evidence.json \
  --execute
```

The first version intentionally accepts an explicit list of public channel usernames. Discovery/search can be layered on later without changing the evidence contract.

For every public channel it normalizes:

### Entity

- channel id;
- title;
- public username / URL;
- description.

### EntityMetricsSnapshot

- subscribers when Telegram exposes `participantsCount`;
- online count when available.

### ContentItem

- public post URL;
- text;
- publication time;
- outbound HTTP links found in post text or URL buttons;
- research-query provenance.

### MetricsSnapshot

- views;
- forwards;
- total reactions;
- comment/reply count.

## Repeated snapshots

Telegram post counters change over time. Merge a previous evidence file into the next run:

```bash
npm run telegram:collect -- \
  --channels "channel_one,channel_two" \
  --research-queries "AI заработок" \
  --limit 50 \
  --session-file /private/telegram.session \
  --previous /private/telegram-evidence-day1.json \
  --out /private/telegram-evidence-day2.json \
  --execute
```

The shared Distribution Evidence analyzer can then calculate deltas between the two latest snapshots for the same post/channel.

## Analyze locally

```bash
npm run distribution:analyze -- \
  --input /private/telegram-evidence-day2.json \
  --out /private/telegram-analysis.json
```

The same `yaai_distribution_evidence` MCP tool can analyze the saved JSON from a workspace. MCP never logs into Telegram and never makes live MTProto requests.

## Metric boundaries

A Telegram view, forward, reaction, comment, or subscriber counter is observed evidence only.

Do not interpret these counters alone as:

- sales or conversions;
- unique audience;
- paid placement effectiveness;
- causal lift;
- audience quality;
- a universal score comparable to YouTube/X/VK.

`viewsPerSubscriber` is only a size-context ratio inside the existing Distribution Evidence layer. Telegram views may include non-subscribers and repeated exposure rules are platform-specific.

## Rate limits

Telegram can return FloodWait/rate-limit errors. The collector deliberately:

- reads only explicitly requested channels;
- caps the post limit at 200 per channel;
- caps a run at 50 channels;
- performs no automatic retry storm.

If Telegram asks to wait, stop and retry later rather than rotating accounts or bypassing the limit.
