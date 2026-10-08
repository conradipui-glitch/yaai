import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function assert(value, message) {
  if (!value) throw new Error(message);
}
async function readJson(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value === null) throw new Error('Saved record cannot be JSON null');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Invalid saved Yandex checkpoint at ' + file + ': ' + error.message);
  }
}
async function writeExclusive(file, value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  const temporary = path.join(path.dirname(file),
    '.' + path.basename(file) + '.' + crypto.randomBytes(8).toString('hex') + '.tmp');
  try {
    await fs.writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
    // Atomic and non-overwriting: never silently replace paid response evidence.
    await fs.link(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function collectYandexWithCheckpoints({
  output, kind, requests, directory,
  fetchRequest, validateResult, onProgress,
} = {}) {
  assert(output && kind && /^[a-z0-9-]+$/.test(kind), 'Output and Yandex collection kind are required.');
  assert(Array.isArray(requests) && requests.length && requests.length <= 100, 'Expected 1–100 Yandex requests.');
  assert(typeof fetchRequest === 'function' && typeof validateResult === 'function', 'Missing collector/validator.');
  const dest = path.resolve(output);
  const root = path.resolve(directory || dest + '.yandex-checkpoints');
  assert(root !== dest && dest !== path.resolve(root, '..') &&
    !dest.startsWith(root + path.sep), 'Output must be separate from the checkpoint directory.');

  // Existing destination must fail BEFORE requesting more paid responses.
  try {
    await fs.lstat(dest);
    throw new Error('Output already exists; refusing paid Yandex requests: ' + dest);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const manifest = {
    version: 1, kind, batchHash: sha({ kind, requests }),
    count: requests.length,
  };
  const manifestFile = path.join(root, 'manifest.json');
  const previous = await readJson(manifestFile);
  if (previous && JSON.stringify(previous) !== JSON.stringify(manifest)) {
    throw new Error('Incompatible saved Yandex checkpoints (batch, region, settings or folder differ). Use a new --out/directory.');
  }
  // Do not adopt orphaned/corrupt files or checkpoints from another run.
  let existingNames = [];
  try { existingNames = await fs.readdir(root); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!previous && existingNames.length) {
    throw new Error('Yandex checkpoint directory has files but no valid manifest: ' + root);
  }
  const expected = new Set(['manifest.json']);
  const slots = requests.map((request, index) => {
    const requestHash = sha({ kind, request });
    const name = String(index + 1).padStart(3, '0') + '-' + requestHash + '.json';
    expected.add(name);
    return { index, request, requestHash, file: path.join(root, name) };
  });
  for (const name of existingNames) {
    if (!expected.has(name)) {
      throw new Error('Unexpected Yandex checkpoint file: ' + name + ' (refusing paid requests).');
    }
  }
  // Validate all recovered answers before the first charge.
  const recovered = await Promise.all(slots.map(async slot => {
    const saved = await readJson(slot.file);
    if (!saved) return null;
    assert(saved.version === 1 && saved.kind === kind &&
      saved.batchHash === manifest.batchHash && saved.requestHash === slot.requestHash &&
      saved.checksum === sha(saved.result),
      'Mismatched or damaged saved Yandex checkpoint: ' + slot.file);
    validateResult(saved.result, slot.request);
    return saved.result;
  }));

  if (!previous) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await writeExclusive(manifestFile, manifest);
  }
  const results = [];
  let newCalls = 0;
  let reusedCalls = 0;
  for (const slot of slots) {
    let result = recovered[slot.index];
    const reused = result !== null;
    if (reused) reusedCalls++;
    else {
      result = await fetchRequest(slot.request);
      validateResult(result, slot.request);
      await writeExclusive(slot.file, {
        version: 1, kind, batchHash: manifest.batchHash,
        requestHash: slot.requestHash, checksum: sha(result), result,
      });
      newCalls++;
    }
    results.push(result);
    if (onProgress) await onProgress({
      index: slot.index + 1, total: slots.length, result, request: slot.request, reused,
    });
  }
  return { results, newCalls, reusedCalls, checkpointDir: root };
}
