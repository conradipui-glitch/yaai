import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yaai-yandex-restart-'));
const mockFile = path.join(root, 'fetch-mock.mjs');
await fs.writeFile(mockFile, [
  "import fs from 'node:fs';",
  "const events = process.env.YAAI_MOCK_EVENTS;",
  "let calls = 0;",
  "globalThis.fetch = async (url, options) => {",
  "  calls++;",
  "  const body = JSON.parse(options.body);",
  "  fs.appendFileSync(events, JSON.stringify({ url: String(url), body }) + '\\n');",
  "  if (Number(process.env.YAAI_MOCK_FAIL_AT) === calls) throw new Error('synthetic provider outage');",
  "  if (String(url).includes('/wordstat/topRequests')) return {",
  "    ok: true, status: 200,",
  "    json: async () => ({ results: [{ phrase: body.phrase + ' цена', count: 100 }],",
  "      associations: [{ phrase: body.phrase + ' отзывы', count: 0 }] }),",
  "  };",
  "  if (String(url).includes('/web/search')) {",
  "    const query = body.query.queryText;",
  "    const xml = '<response><query>' + query + '</query><found>1</found>' +",
  "      '<doc><url>https://example.org/example</url><title>Sample</title>' +",
  "      '<passage>Fixture only</passage></doc></response>';",
  "    return { ok: true, status: 200, text: async () =>",
  "      JSON.stringify({ rawData: Buffer.from(xml).toString('base64') }) };",
  "  }",
  "  throw new Error('Unexpected external provider operation: ' + url);",
  "};",
].join('\n') + '\n');

const log = path.join(root, 'api-calls.jsonl');
async function events() {
  try { return (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
function run(script, args, { failAt = 0 } = {}) {
  const result = spawnSync(process.execPath,
    ['--import', mockFile, path.join(project, 'scripts', script), ...args],
    { cwd: project, encoding: 'utf8',
      env: {
        ...process.env, YAAI_MOCK_EVENTS: log,
        YAAI_MOCK_FAIL_AT: String(failAt),
        YAIS_API: 'synthetic-not-a-real-key',
        YAIS_FOLDER_ID: 'synthetic-folder',
        YANDEX_SEARCH_FOLDER_ID: 'synthetic-folder',
      },
    });
  if (result.error) throw result.error;
  return result;
}

try {
  const output = path.join(root, 'wordstat.json');
  const args = ['--seeds','первая тема,вторая тема,третья тема','--region','225',
    '--num-phrases','90','--out',output,'--execute'];
  const first = run('pain-wordstat.mjs', args, { failAt: 2 });
  assert.notEqual(first.status, 0, 'synthetic mid-batch outage must fail');
  assert.match(first.stderr, /synthetic provider outage/);
  await assert.rejects(fs.stat(output), { code: 'ENOENT' });
  assert.equal((await events()).length, 2);

  const changedRegion = run('pain-wordstat.mjs',
    args.map(arg => arg === '225' ? '226' : arg));
  assert.notEqual(changedRegion.status, 0);
  assert.match(changedRegion.stderr, /Incompatible saved Yandex checkpoints/);
  assert.equal((await events()).length, 2, 'region mismatch must not hit provider');

  const resume = run('pain-wordstat.mjs', args);
  assert.equal(resume.status, 0, resume.stderr);
  const restored = JSON.parse(await fs.readFile(output, 'utf8'));
  assert.equal(restored.calls.length, 3);
  assert.equal(restored.rowCount, 6);
  assert.equal(restored.rows.filter(row => row.count === 0).length, 3);
  assert.match(resume.stdout, /"reusedApiCalls": 1/);
  assert.match(resume.stdout, /"apiCalls": 2/);
  assert.equal((await events()).length, 4, 'only remaining requests can hit provider');

  const noOverwrite = run('pain-wordstat.mjs', args);
  assert.notEqual(noOverwrite.status, 0);
  assert.match(noOverwrite.stderr, /Output already exists/);
  assert.equal((await events()).length, 4);

  const serpOut = path.join(root, 'serp.json');
  const serpArgs = ['--queries','первый запрос,второй запрос', '--region','225',
    '--groups','5','--out',serpOut,'--execute'];
  const searchFirst = run('serp-collect.mjs', serpArgs, { failAt: 2 });
  assert.notEqual(searchFirst.status, 0);
  assert.match(searchFirst.stderr, /synthetic provider outage/);
  assert.equal((await events()).length, 6);

  const searchResume = run('serp-collect.mjs', serpArgs);
  assert.equal(searchResume.status, 0, searchResume.stderr);
  const serp = JSON.parse(await fs.readFile(serpOut, 'utf8'));
  assert.equal(serp.queries.length, 2);
  assert.equal(serp.queries[0].results[0].domain, 'example.org');
  assert.match(searchResume.stdout, /"reusedApiCalls": 1/);
  assert.match(searchResume.stdout, /"newApiCalls": 1/);
  assert.equal((await events()).length, 7);

  const checkpointDir = serpOut + '.yandex-checkpoints';
  const savedFiles = (await fs.readdir(checkpointDir)).filter(name => name !== 'manifest.json');
  const damaged = path.join(checkpointDir, savedFiles[0]);
  const record = JSON.parse(await fs.readFile(damaged, 'utf8'));
  record.result.query = 'tampered';
  await fs.writeFile(damaged, JSON.stringify(record));
  const attempt = run('serp-collect.mjs', [
    ...serpArgs.slice(0, serpArgs.indexOf('--out')), '--out',
    path.join(root, 'alternative-serp.json'), '--checkpoint-dir', checkpointDir, '--execute',
  ]);
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stderr, /Mismatched or damaged saved Yandex checkpoint/);
  assert.equal((await events()).length, 7);

  const noConsent = run('serp-collect.mjs', serpArgs.filter(arg => arg !== '--execute'));
  assert.notEqual(noConsent.status, 0);
  assert.match(noConsent.stderr, /Add --execute explicitly/);
  assert.equal((await events()).length, 7);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('Yandex request checkpoint selftest: ok (Wordstat and SERP interrupted/resumed with mock transport, no paid APIs)');
