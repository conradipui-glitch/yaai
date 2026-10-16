import fs from 'node:fs/promises';
import path from 'node:path';
import { safeConfigId } from './workspace.mjs';
import { listTasksWithExecution } from './task-executor.mjs';

// Bounded, read-only projection for the loopback Studio shell.
// Never expose the underlying case JSON, local filesystem paths, or credentials.
async function directoryExists(directory) {
  try {
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Небезопасная папка проекта');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function studioOverview({ workspaceRoot, casesDir = path.join(workspaceRoot, 'cases'), caseId = '' } = {}) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') throw Error('Не задана рабочая папка');
  if (!await directoryExists(workspaceRoot)) return { cases: [], activeCaseId: null, tasks: [], taskCount: 0 };
  if (!await directoryExists(casesDir)) return { cases: [], activeCaseId: null, tasks: [], taskCount: 0 };

  const entries = (await fs.readdir(casesDir)).filter(name => name.endsWith('.json')).sort();
  if (entries.length > 100) throw Error('Слишком много проектов для обзора Studio');
  const cases = [];
  for (const filename of entries) {
    const id = filename.slice(0, -5);
    try { safeConfigId(id, 'case id'); } catch { throw Error('Некорректное имя файла проекта'); }
    const file = path.join(casesDir, filename);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw Error('Небезопасный файл проекта');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (record?.id !== id) throw Error('Некорректный идентификатор проекта');
    const name = typeof record.name === 'string' && record.name.trim() && record.name.length <= 120
      ? record.name.trim() : id;
    cases.push({ id, name });
  }

  const chosen = caseId ? safeConfigId(caseId, 'case id') : '';
  if (chosen && !cases.some(item => item.id === chosen)) {
    const error = Error('Проект не найден');
    error.status = 404;
    throw error;
  }
  if (!chosen) return { cases, activeCaseId: null, tasks: [], taskCount: 0 };

  const result = await listTasksWithExecution({ workspaceRoot, caseId: chosen, limit: 40 });
  return {
    cases,
    activeCaseId: chosen,
    taskCount: result.total,
    tasks: result.tasks.map(task => ({
      id: task.id,
      title: task.title,
      kind: task.kind,
      status: task.status,
      updatedAt: task.updatedAt,
      executionStatus: task.execution?.status ?? null,
    })),
    tasksOmitted: result.omitted,
  };
}
