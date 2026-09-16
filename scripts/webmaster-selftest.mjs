import assert from 'node:assert/strict';
import { createWebmasterClient, matchVerifiedHost, webmasterOAuthToken } from '../lib/webmaster.mjs';

const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url, options });
  const endpoint = new URL(url).pathname;
  let output = {};
  if (endpoint === '/v4/user') output = { user_id: 42 };
  if (endpoint === '/v4/user/42/hosts') output = { hosts: [{ host_id: 'https:site.test:443', verified: true, ascii_host_url: 'https://site.test/' }] };
  if (endpoint.endsWith('/pro/limits')) output = { limits: [{ feature: 'PRO_SERP', remaining: 5 }] };
  if (endpoint.endsWith('/pro/serp/dates')) output = { dates: ['2026-09-01'] };
  if (endpoint.endsWith('/queries/download/')) output = { task_id: '12345678-abcd', free_quota_used: 1 };
  if (endpoint.endsWith('/queries/download/12345678-abcd')) output = { download_status: 'IN_PROGRESS' };
  return new Response(JSON.stringify(output), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

assert.equal(webmasterOAuthToken({ YANDEX_API_KEY: 'cloud-only' }), '');
assert.equal(webmasterOAuthToken({ YANDEX_WEBMASTER_OAUTH_TOKEN: 'oauth' }), 'oauth');
assert.throws(() => createWebmasterClient({ token: '' }), /Webmaster OAuth token is missing/);
const client = createWebmasterClient({ token: 'dummy-oauth', fetchImpl });
assert.equal((await client.user()).user_id, 42);
const hosts = await client.hosts(42);
assert.equal(matchVerifiedHost(hosts.hosts, 'https://site.test/project/').host_id, 'https:site.test:443');
assert.throws(() => matchVerifiedHost(hosts.hosts, 'https://other.test/'), /Expected one verified/);
assert.equal((await client.limits(42, 'https:site.test:443')).limits.length, 1);
assert.deepEqual((await client.dates(42, 'https:site.test:443')).dates, ['2026-09-01']);
assert.throws(() => client.start(42, 'x', { dates: [], paths: ['/'] }), /Provide one or more dates/);
assert.throws(() => client.start(42, 'x', { dates: ['2026-09-01'], paths: ['http://wrong.test/'] }), /Provide URL paths/);
assert.throws(() => client.start(42, 'x', { dates: Array(100).fill('2026-09-01'), paths: ['/'] }), /at most 100/);
const started = await client.start(42, 'https:site.test:443', { dates: ['2026-09-01'], paths: ['/project/'] });
assert.equal(started.task_id, '12345678-abcd');
assert.equal((await client.status(42, 'https:site.test:443', started.task_id)).download_status, 'IN_PROGRESS');
assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
const post = calls.find((call) => call.options.method === 'POST');
assert.equal(JSON.parse(post.options.body).use_pro_tariff, 'false');
assert.equal(post.options.headers.Authorization, 'OAuth dummy-oauth');
assert.ok(post.url.includes('https%3Asite.test%3A443'));
console.log('Webmaster mock self-test: passed (no network, no paid exports).');
