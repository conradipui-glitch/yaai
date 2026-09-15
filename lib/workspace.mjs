import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.dirname(MODULE_DIR);

function argValue(name, args = process.argv.slice(2)) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function resolveFromCwd(value, cwd = process.cwd()) {
  return path.resolve(cwd, String(value || '.').trim() || '.');
}

export function resolveWorkspaceRoot({ args = process.argv.slice(2), env = process.env, cwd = process.cwd() } = {}) {
  return resolveFromCwd(argValue('--workspace', args) || env.YAAI_WORKSPACE || cwd, cwd);
}

export function resolveCaseId({ args = process.argv.slice(2), env = process.env } = {}) {
  return String(argValue('--case', args) || env.CASE_ID || env.YAAI_CASE_ID || '').trim();
}
export function requireCaseId(value = resolveCaseId()) {
  if (!value) throw new Error('Case id is required. Set CASE_ID/YAAI_CASE_ID or pass --case <id>.');
  return value;
}

export function workspacePaths(root = resolveWorkspaceRoot(), { args = process.argv.slice(2), env = process.env, cwd = process.cwd() } = {}) {
  const workspace = path.resolve(root);
  const casesOverride = argValue('--case-root', args) || env.YAAI_CASE_ROOT;
  return {
    root: workspace,
    cases: casesOverride ? resolveFromCwd(casesOverride, cwd) : path.join(workspace, 'cases'),
    presets: path.join(workspace, 'presets'),
    planners: path.join(workspace, 'planners'),
    results: path.join(workspace, 'results'),
    snapshots: path.join(workspace, 'snapshots'),
  };
}

export function safeConfigId(value, label = 'id') {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(id)) throw new Error(`Invalid ${label}: ${id || '(empty)'}`);
  return id;
}
