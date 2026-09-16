import fs from 'node:fs/promises';
import path from 'node:path';
import { createWebmasterClient, matchVerifiedHost } from '../lib/webmaster.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'probe';
function flag(name) {
  const direct = args.find((item) => item.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
function csvFlag(name) {
  return String(flag(name) || '').split(',').map((item) => item.trim()).filter(Boolean);
}
function fail(message) { throw new Error(message); }

const site = flag('--site') || process.env.YAAI_WEBMASTER_SITE;
if (!site) fail('Specify --site https://your-verified-site.example/ (no client-specific default).');
const client = createWebmasterClient();
const { user_id: userId } = await client.user();
const hosts = await client.hosts(userId);
const host = matchVerifiedHost(hosts.hosts, site);
const hostId = host.host_id;
if (!hostId) fail('Webmaster returned no host_id.');

if (command === 'probe') {
  const [limits, available] = await Promise.all([client.limits(userId, hostId), client.dates(userId, hostId)]);
  const dates = Array.isArray(available.dates) ? available.dates : [];
  console.log(JSON.stringify({
    site: host.ascii_host_url,
    verified: true,
    hostDataStatus: host.host_data_status || null,
    limits: limits.limits || [],
    availableDates: dates.length,
    oldestDate: dates.length ? [...dates].sort()[0] : null,
    newestDate: dates.length ? [...dates].sort().at(-1) : null,
  }, null, 2));
} else if (command === 'start') {
  if (!args.includes('--execute')) fail('No export started. Add --execute explicitly after reviewing requested dates and URL paths.');
  const dates = csvFlag('--dates');
  const paths = csvFlag('--paths');
  if (!dates.length || !paths.length) fail('Provide --dates YYYY-MM-DD,YYYY-MM-DD and --paths /page-1/,/page-2/.');
  const available = await client.dates(userId, hostId);
  const allowedDates = new Set(available.dates || []);
  if (dates.some((date) => !allowedDates.has(date))) fail('At least one date is not available. Run probe to inspect available dates.');
  const regionIds = csvFlag('--regions').map((item) => Number(item));
  if (regionIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) fail('Region IDs must be positive integers.');
  const useProTariff = args.includes('--use-pro-tariff');
  if (useProTariff && !args.includes('--allow-paid')) fail('Extended access may incur charges. Add --allow-paid to confirm use of the Pro quota.');
  const result = await client.start(userId, hostId, { dates, paths, regionIds, useProTariff });
  console.log(JSON.stringify({ taskId: result.task_id, freeQuotaUsed: result.free_quota_used,
    proQuotaUsed: result.pro_quota_used, freeQuotaRemaining: result.free_quota_remaining,
    proQuotaRemaining: result.pro_quota_remaining }, null, 2));
} else if (command === 'status' || command === 'download') {
  const taskId = flag('--task');
  if (!taskId) fail('Provide --task <task-id> returned by start.');
  const result = await client.status(userId, hostId, taskId);
  if (command === 'status') {
    console.log(JSON.stringify({ status: result.download_status, taskId, ready: result.download_status === 'SUCCESS',
      error: result.error_code || null }, null, 2));
  } else {
    if (result.download_status !== 'SUCCESS' || !result.url) fail(`Report is not ready: ${result.download_status || 'unknown'}.`);
    const output = flag('--out');
    if (!output) fail('Specify --out /private/path/report.csv. Never commit the raw Webmaster export to the public engine repository.');
    const download = new URL(result.url);
    if (download.protocol !== 'https:' || download.hostname !== 'storage.mds.yandex.net') fail('Unexpected report download host; refusing download.');
    const response = await fetch(download);
    if (!response.ok) fail(`Report download failed with HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const destination = path.resolve(output);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ saved: destination, bytes: bytes.length }, null, 2));
  }
} else {
  fail('Unknown command. Use probe, start, status, or download.');
}
