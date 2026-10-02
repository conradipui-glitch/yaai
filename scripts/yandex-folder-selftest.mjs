import assert from 'node:assert/strict';

import { discoverYandexFolderId, extractYandexFolderId } from '../lib/yandex-folder.mjs';

const realId = 'b1abcdefghijklmnopqr';

assert.equal(extractYandexFolderId(`folder ID "${realId}"`), realId);
assert.equal(extractYandexFolderId(`service account folder ID '${realId}'`), realId);
assert.equal(extractYandexFolderId('nothing useful'), '');

let calls = 0;
const explicit = await discoverYandexFolderId({
  apiKey: 'key',
  folderId: realId,
  fetchImpl: async () => {
    calls += 1;
    throw new Error('should not fetch');
  },
});
assert.equal(explicit, realId);
assert.equal(calls, 0);

const discoveredFromWordstat = await discoverYandexFolderId({
  apiKey: 'key',
  keyId: 'wrong-key-id',
  fetchImpl: async (url) => {
    assert.match(String(url), /wordstat\/getRegionsTree$/);
    return {
      ok: false,
      text: async () => JSON.stringify({
        message: `folder ID "wrong-key-id" does not match with service account folder ID "${realId}"`,
      }),
    };
  },
});
assert.equal(discoveredFromWordstat, realId);

let aiCalls = 0;
const discoveredFromAi = await discoverYandexFolderId({
  apiKey: 'key',
  fetchImpl: async (url) => {
    aiCalls += 1;
    assert.match(String(url), /foundationModels\/v1\/completion$/);
    return {
      ok: false,
      text: async () => JSON.stringify({
        message: `model folder does not match with service account folder ID "${realId}"`,
      }),
    };
  },
});
assert.equal(discoveredFromAi, realId);
assert.equal(aiCalls, 1);

const missing = await discoverYandexFolderId({
  apiKey: 'key',
  fetchImpl: async () => ({
    ok: false,
    text: async () => JSON.stringify({ message: 'permission denied without folder detail' }),
  }),
});
assert.equal(missing, '');

console.log('yandex folder selftest: ok');
