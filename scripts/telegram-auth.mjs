import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = process.argv.slice(2);

function flag(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

if (!args.includes('--execute')) {
  throw new Error('No Telegram login started. Add --execute explicitly. Run this only on a trusted local machine.');
}

const apiId = Number(process.env.TELEGRAM_API_ID || '');
const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
const out = flag('--out');

if (!Number.isSafeInteger(apiId) || apiId <= 0) throw new Error('TELEGRAM_API_ID is missing or invalid.');
if (!apiHash) throw new Error('TELEGRAM_API_HASH is missing.');
if (!out) throw new Error('Specify --out /private/telegram.session.');

const { TelegramClient } = await import('teleproto');
const { StringSession } = await import('teleproto/sessions');

const rl = createInterface({ input, output });
const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
  connectionRetries: 5,
});

try {
  await client.start({
    phoneNumber: () => rl.question('Telegram phone number: '),
    phoneCode: () => rl.question('Telegram login code: '),
    password: () => rl.question('Telegram 2FA password (if enabled): '),
    onError: (error) => console.error(`Telegram auth: ${error?.message || error}`),
  });

  await client.getMe();
  const session = String(client.session.save() || '').trim();
  if (!session) throw new Error('Telegram authenticated but no session string was produced.');

  const destination = path.resolve(out);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${session}\n`, { flag: 'wx', mode: 0o600 });

  console.log(JSON.stringify({
    saved: destination,
    note: 'Treat this session file like an active login credential. Never commit or upload it.',
  }, null, 2));
} finally {
  rl.close();
  await client.disconnect().catch(() => {});
}
