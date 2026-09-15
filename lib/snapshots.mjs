import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveWorkspaceRoot, workspacePaths } from './workspace.mjs';

export function safeCaseId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(id)) throw new Error(`Invalid CASE_ID: ${id || '(empty)'}`);
  return id;
}

export async function loadCase(caseId, root = resolveWorkspaceRoot()) {
  const id = safeCaseId(caseId);
  const file = path.join(workspacePaths(root).cases, `${id}.json`);
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  if (String(data.id || '') !== id) throw new Error(`Case id mismatch in ${file}`);
  return { ...data, _file: file };
}

export function caseFingerprint(caseConfig) {
  const stable = {
    id: caseConfig.id,
    resultPrefix: caseConfig.resultPrefix,
    regions: caseConfig.regions || [],
    devices: caseConfig.devices || [],
    numPhrases: caseConfig.numPhrases ?? null,
    seeds: caseConfig.seeds || [],
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

export function snapshotParts(date = new Date()) {
  const iso = date.toISOString();
  return {
    iso,
    date: iso.slice(0, 10),
    time: iso.slice(11, 19).replaceAll(':', '') + 'Z',
  };
}

export function caseRoot(caseId, root = resolveWorkspaceRoot()) {
  return path.join(workspacePaths(root).snapshots, safeCaseId(caseId));
}

export async function ensureCaseMetadata(caseConfig, root = resolveWorkspaceRoot()) {
  const dir = caseRoot(caseConfig.id, root);
  await fs.mkdir(dir, { recursive: true });
  const publicCase = { ...caseConfig };
  delete publicCase._file;
  await fs.writeFile(path.join(dir, 'case.json'), JSON.stringify(publicCase, null, 2), 'utf8');
  return dir;
}

export async function listSnapshotManifests(caseId, root = resolveWorkspaceRoot()) {
  const base = path.join(caseRoot(caseId, root), 'snapshots');
  const found = [];
  let dates = [];
  try { dates = await fs.readdir(base, { withFileTypes: true }); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  for (const dateEntry of dates.filter((x) => x.isDirectory())) {
    const dateDir = path.join(base, dateEntry.name);
    const runs = await fs.readdir(dateDir, { withFileTypes: true });
    for (const runEntry of runs.filter((x) => x.isDirectory())) {
      const manifestPath = path.join(dateDir, runEntry.name, 'manifest.json');
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        found.push({ manifest, manifestPath, dir: path.dirname(manifestPath) });
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  return found.sort((a, b) => String(a.manifest.generatedAt || '').localeCompare(String(b.manifest.generatedAt || '')));
}

export function pctChange(previous, current) {
  const a = Number(previous || 0);
  const b = Number(current || 0);
  if (a <= 0) return null;
  return ((b - a) / a) * 100;
}

