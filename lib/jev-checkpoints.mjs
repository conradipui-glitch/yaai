import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY = /^[a-f0-9]{64}$/;

export async function ensureFreshOutputPaths(paths) {
  const resolved = paths.filter(Boolean).map(value => path.resolve(value));
  if (new Set(resolved).size !== resolved.length) {
    throw new Error('Output paths must be distinct.');
  }
  for (const filename of resolved) {
    try {
      await fs.lstat(filename);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error('Refusing to spend on an existing output file: ' + filename);
  }
}

// A private, durable, per-request cache. Not an API cache: every record is tied
// to the full request signature (model, profile, item ID, state and metadata).
// Successful writes use a temporary file and atomic rename, so a crash cannot
// leave a half-written JSON result at its final path.
export function createJevCheckpointStore(directory) {
  const root = path.resolve(directory);
  const filename = (key) => {
    if (!KEY.test(key)) throw new Error('Invalid Jev checkpoint key.');
    return path.join(root, key + '.json');
  };
  return {
    root,
    async load(key) {
      let raw;
      try {
        raw = await fs.readFile(filename(key), 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      let record;
      try {
        record = JSON.parse(raw);
      } catch {
        throw new Error('Corrupt Jev checkpoint JSON for ' + key + '; inspect or move it before retrying.');
      }
      if (record?.version !== 1 || record.key !== key ||
          !record.evaluation || typeof record.evaluation !== 'object' ||
          !record.evaluation.answers || !record.evaluation.route ||
          !record.evaluation.usage) {
        throw new Error('Invalid Jev checkpoint for ' + key + '; inspect or move it before retrying.');
      }
      return record.evaluation;
    },
    async save(key, evaluation) {
      const dest = filename(key);
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      const stats = await fs.stat(root);
      if (!stats.isDirectory()) throw new Error('Jev checkpoint path must be a directory.');
      const temp = path.join(root, '.' + key + '.' + crypto.randomBytes(8).toString('hex') + '.tmp');
      try {
        await fs.writeFile(temp, JSON.stringify({
          version: 1, key, savedAt: new Date().toISOString(), evaluation,
        }) + '\n', { flag: 'wx', mode: 0o600 });
        // link() is exclusive: never overwrite an existing paid answer.
        try {
          await fs.link(temp, dest);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const existing = await this.load(key);
          if (JSON.stringify(existing) !== JSON.stringify(evaluation)) {
            throw new Error('Conflicting Jev checkpoint for ' + key + '; concurrent writers are not supported.');
          }
        }
      } finally {
        await fs.rm(temp, { force: true });
      }
    },
  };
}
