#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_CONFIG = {
  statuses: {
    'new': 'New',
    'approved': 'Approved',
    'test-ready': 'Test Ready',
    'testing': 'Testing',
    'reopened': 'Reopened',
    'rejected': 'Rejected',
    'done': 'Done'
  },
  priorities: {
    'low': 'Low',
    'medium': 'Medium',
    'high': 'High',
    'urgent': 'Urgent'
  },
  types: {
    'bug': 'Bug',
    'future': 'Future',
    'change': 'Change'
  },
  defaultStatus: 'new',
  defaultPriority: 'medium',
  defaultType: 'bug',
  allowCustomTags: true
};

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value));
}

async function readStdinFallback() {
  if (process.stdin.isTTY) {
    return '';
  }
  process.stdin.setEncoding('utf8');
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

function normalizeInput(envelope) {
  let current = envelope;
  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== 'object') break;
    if (current.input && typeof current.input === 'object') {
      current = current.input;
      continue;
    }
    if (current.arguments && typeof current.arguments === 'object') {
      current = current.arguments;
      continue;
    }
    if (current.params?.arguments && typeof current.params.arguments === 'object') {
      current = current.params.arguments;
      continue;
    }
    if (current.params?.input && typeof current.params.input === 'object') {
      current = current.params.input;
      continue;
    }
    break;
  }
  return current && typeof current === 'object' ? current : {};
}

function getWorkspaceRoot() {
  const roots = [
    process.env.WORKSPACE_ROOT,
    process.env.PLOINKY_WORKSPACE_ROOT,
    process.env.ASSISTOS_FS_ROOT
  ].filter((value) => typeof value === 'string' && value.trim());
  const cwd = process.cwd();
  if (roots.length) {
    const candidate = path.resolve(roots[0]);
    if (fsSync.existsSync(path.join(candidate, '.ploinky', 'repos'))) {
      return candidate;
    }
  }
  const byRepos = findWorkspaceRootByReposDir(cwd);
  if (byRepos) return byRepos;
  return findWorkspaceRoot(cwd);
}

function getRepoRootFromArgs(args = {}) {
  const repoPath = normalizeString(args?.repoPath);
  if (!repoPath) {
    throw new Error('repoPath is required.');
  }
  if (repoPath.startsWith('/.ploinky/')) {
    throw new Error('repoPath must be an absolute filesystem path (e.g. /Users/.../repos/<repo>), not /.ploinky/...');
  }
  if (!path.isAbsolute(repoPath)) {
    throw new Error('repoPath must be an absolute path.');
  }
  const resolved = path.resolve(repoPath);
  if (!fsSync.existsSync(resolved)) {
    throw new Error(`repoPath does not exist: ${resolved}`);
  }
  if (!fsSync.statSync(resolved).isDirectory()) {
    throw new Error(`repoPath is not a directory: ${resolved}`);
  }
  return resolved;
}

function configPathForRoot(root) {
  return path.join(root, '.backlog.config.json');
}

function backlogPathForRoot(root) {
  return path.join(root, '.backlog');
}

function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 12; i += 1) {
    if (
      fsSync.existsSync(path.join(current, '.backlog.config.json'))
      || fsSync.existsSync(path.join(current, '.backlog'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir || process.cwd());
}

function findWorkspaceRootByReposDir(startDir) {
  let current = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 12; i += 1) {
    if (fsSync.existsSync(path.join(current, '.ploinky', 'repos'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

function normalizeConfig(input) {
  const cfg = input && typeof input === 'object' ? input : {};
  let statuses = cfg.statuses && typeof cfg.statuses === 'object' ? cfg.statuses : DEFAULT_CONFIG.statuses;
  if (statuses && (statuses.todo || statuses['in-progress'] || statuses['dev-ready'])) {
    statuses = DEFAULT_CONFIG.statuses;
  }
  const priorities = cfg.priorities && typeof cfg.priorities === 'object' ? cfg.priorities : DEFAULT_CONFIG.priorities;
  const types = cfg.types && typeof cfg.types === 'object' ? cfg.types : DEFAULT_CONFIG.types;
  const statusKeys = Object.keys(statuses);
  const priorityKeys = Object.keys(priorities);
  const typeKeys = Object.keys(types);
  const defaultStatus = statusKeys.includes(cfg.defaultStatus) ? cfg.defaultStatus : DEFAULT_CONFIG.defaultStatus;
  const defaultPriority = priorityKeys.includes(cfg.defaultPriority) ? cfg.defaultPriority : DEFAULT_CONFIG.defaultPriority;
  const defaultType = typeKeys.includes(cfg.defaultType) ? cfg.defaultType : DEFAULT_CONFIG.defaultType;
  return {
    statuses,
    priorities,
    types,
    defaultStatus: statusKeys.includes(defaultStatus) ? defaultStatus : statusKeys[0],
    defaultPriority: priorityKeys.includes(defaultPriority) ? defaultPriority : priorityKeys[0],
    defaultType: typeKeys.includes(defaultType) ? defaultType : typeKeys[0],
    allowCustomTags: cfg.allowCustomTags !== false
  };
}

async function loadConfig() {
  const normalized = normalizeConfig(DEFAULT_CONFIG);
  return { config: normalized, configPath: null };
}

async function loadBacklogIndex(root, backlogPath = '') {
  const { tasks, backlogPaths } = await loadTasks(root, backlogPath);
  const files = [];
  for (const filePath of backlogPaths) {
    const fileTasks = await loadTasksFromFile(filePath);
    files.push({ path: filePath, tasks: fileTasks.map(normalizeTask) });
  }
  const byId = new Map();
  for (const file of files) {
    for (const task of file.tasks) {
      const id = normalizeString(task.id);
      if (!id) continue;
      if (!byId.has(id)) {
        byId.set(id, { task, sourcePath: file.path });
      }
    }
  }
  return { tasks, files, byId };
}

const BACKLOG_EXTENSION = '.backlog';
const BACKLOG_EXCLUDED_DIRS = new Set(['.git', '.ploinky', 'node_modules']);

function isBacklogFilename(name) {
  return typeof name === 'string' && name.endsWith(BACKLOG_EXTENSION);
}

function isSafeChildPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveBacklogPath(root, backlogPath) {
  const raw = normalizeString(backlogPath);
  if (!raw) return '';
  if (raw.startsWith('/.ploinky/')) {
    throw new Error('backlogPath must be an absolute filesystem path inside repoPath, not /.ploinky/...');
  }
  if (!path.isAbsolute(raw)) {
    throw new Error('backlogPath must be an absolute path.');
  }
  const absolute = path.resolve(raw);
  if (!isBacklogFilename(absolute)) {
    throw new Error('backlogPath must end with .backlog.');
  }
  if (!isSafeChildPath(root, absolute)) {
    throw new Error('backlogPath must be inside repoPath.');
  }
  return absolute;
}

async function listBacklogFiles(root) {
  const results = [];
  const walk = async (current, depth) => {
    if (depth > 12) return;
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (BACKLOG_EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(entryPath, depth + 1);
      } else if (entry.isFile()) {
        if (isBacklogFilename(entry.name)) {
          results.push(entryPath);
        }
      }
    }
  };
  await walk(root, 0);
  return results.sort();
}

async function loadTasksFromFile(backlogPath) {
  try {
    const raw = await fs.readFile(backlogPath, 'utf8');
    const parsed = safeParseJson(raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeTask);
    if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks.map(normalizeTask);
  } catch {
    // ignore
  }
  return [];
}

async function ensureBacklogFile(backlogPath) {
  if (!backlogPath) return false;
  try {
    await fs.access(backlogPath);
    return true;
  } catch {
    // continue
  }
  try {
    await fs.writeFile(backlogPath, JSON.stringify([], null, 2));
    return true;
  } catch {
    return false;
  }
}

async function loadTasks(root, backlogPath = '') {
  const resolved = backlogPath ? resolveBacklogPath(root, backlogPath) : '';
  if (resolved) {
    const tasks = await loadTasksFromFile(resolved);
    return { tasks: tasks.map((task) => ({ ...task, sourcePath: resolved })), backlogPaths: [resolved] };
  }
  const backlogPaths = await listBacklogFiles(root);
  if (!backlogPaths.length) {
    return { tasks: [], backlogPaths: [] };
  }
  const tasks = [];
  for (const filePath of backlogPaths) {
    const fileTasks = await loadTasksFromFile(filePath);
    tasks.push(...fileTasks.map((task) => ({ ...task, sourcePath: filePath })));
  }
  return { tasks, backlogPaths };
}

async function writeTasks(backlogPath, tasks) {
  const next = Array.isArray(tasks) ? tasks.map(normalizeTask) : [];
  const tmpPath = `${backlogPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2));
  await fs.rename(tmpPath, backlogPath);
}

function taskHash(task) {
  const normalized = normalizeTask(task);
  const payload = {
    id: normalized.id,
    description: normalized.description,
    proposedSolution: normalized.proposedSolution,
    observations: normalized.observations,
    type: normalized.type,
    status: normalized.status,
    priority: normalized.priority,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    updatedBy: normalized.updatedBy
  };
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function decorateTask(task, sourcePath) {
  const normalized = normalizeTask(task);
  return {
    ...normalized,
    sourcePath,
    taskHash: taskHash(normalized)
  };
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return task;
  return {
    id: normalizeString(task.id),
    description: normalizeString(task.description),
    proposedSolution: normalizeString(task.proposedSolution),
    observations: normalizeString(task.observations),
    type: normalizeString(task.type),
    status: normalizeString(task.status),
    priority: normalizeString(task.priority),
    createdAt: normalizeString(task.createdAt),
    updatedAt: normalizeString(task.updatedAt),
    updatedBy: normalizeString(task.updatedBy)
  };
}

function normalizeTags(value, allowCustomTags) {
  const tags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((tag) => tag.trim())
      : [];
  const seen = new Set();
  const filtered = [];
  for (const tag of tags) {
    const cleaned = normalizeString(tag);
    if (!cleaned) continue;
    if (!allowCustomTags) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    filtered.push(cleaned);
  }
  return filtered;
}

function resolveStatus(config, status) {
  const normalized = normalizeString(status);
  if (normalized && config.statuses?.[normalized]) return normalized;
  return config.defaultStatus;
}

function resolvePriority(config, priority) {
  const normalized = normalizeString(priority);
  if (normalized && config.priorities?.[normalized]) return normalized;
  return config.defaultPriority;
}

function resolveType(config, type) {
  const normalized = normalizeString(type);
  if (normalized && config.types?.[normalized]) return normalized;
  return config.defaultType;
}

function generateId(existingIds) {
  const base = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  for (let i = 0; i < 5; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const id = `tsk_${base}_${suffix}`;
    if (!existingIds.has(id)) return id;
  }
  return `tsk_${base}_${Math.random().toString(36).slice(2, 10)}`;
}

function matchQuery(task, query) {
  const q = normalizeString(query).toLowerCase();
  if (!q) return true;
  const description = normalizeString(task.description).toLowerCase();
  const proposedSolution = normalizeString(task.proposedSolution).toLowerCase();
  const observations = normalizeString(task.observations).toLowerCase();
  return description.includes(q) || proposedSolution.includes(q) || observations.includes(q);
}

function taskMatchesFilters(task, filters) {
  const status = normalizeString(filters.status);
  if (status && normalizeString(task.status) !== status) return false;
  const type = normalizeString(filters.type);
  if (type && normalizeString(task.type) !== type) return false;
  const priority = normalizeString(filters.priority);
  if (priority && normalizeString(task.priority) !== priority) return false;
  if (!matchQuery(task, filters.q)) return false;
  return true;
}

async function main() {
  let raw = await fs.readFile(0, 'utf8').catch(() => '');
  if (!raw) {
    raw = await readStdinFallback();
  }
  const envelope = raw && raw.trim() ? safeParseJson(raw) : null;
  const args = normalizeInput(envelope || {});
  const toolName = process.env.TOOL_NAME
    || process.argv[2]
    || envelope?.tool
    || envelope?.params?.name
    || envelope?.params?.tool_name
    || envelope?.name
    || envelope?.tool_name
    || args?.tool_name
    || args?.name;

  if (!toolName) {
    writeJson({ ok: false, error: 'Missing TOOL_NAME.' });
    return;
  }

  const root = getRepoRootFromArgs(args);
  try {
    if (toolName === 'task_config') {
      const { config, configPath } = await loadConfig();
      writeJson({ ok: true, config, configPath });
      return;
    }

    const { config } = await loadConfig();
    const backlogPathRaw = args?.backlogPath ?? args?.backlog_path ?? args?.path ?? '';
    const backlogPathArg = normalizeString(backlogPathRaw);
    const { tasks, files, byId } = await loadBacklogIndex(root, backlogPathArg);
    const existingIds = new Set(tasks.map((task) => normalizeString(task.id)).filter(Boolean));

    if (toolName === 'task_list') {
      const filters = args && typeof args === 'object' ? args : {};
      if (filters.__debug === true) {
        writeJson({
          ok: false,
          error: 'debug',
          debug: {
            argsKeys: Object.keys(filters),
            backlogPathRaw,
            backlogPathArg,
            repoPath: normalizeString(args?.repoPath),
            root
          }
        });
        return;
      }
      if (!backlogPathArg) {
        writeJson({ ok: false, error: 'backlogPath is required.' });
        return;
      }
      let filtered = tasks.filter((task) => taskMatchesFilters(task, filters));
      filtered = filtered.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      const limit = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : null;
      if (limit && limit > 0) filtered = filtered.slice(0, limit);
      writeJson({ ok: true, tasks: filtered.map((task) => decorateTask(task, task.sourcePath)) });
      return;
    }

    if (toolName === 'task_get') {
      const id = normalizeString(args?.id);
      if (!id) throw new Error('task_get requires an "id" string.');
      if (!backlogPathArg) {
        writeJson({ ok: false, error: 'backlogPath is required.' });
        return;
      }
      const match = byId.get(id);
      if (!match) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      writeJson({ ok: true, task: decorateTask(match.task, match.sourcePath) });
      return;
    }

    if (toolName === 'task_create') {
      if (!backlogPathArg) {
        writeJson({ ok: false, error: 'backlogPath is required.' });
        return;
      }
      const id = generateId(existingIds);
      const now = new Date().toISOString();
      const task = {
        id,
        description: normalizeString(args?.description),
        proposedSolution: normalizeString(args?.proposedSolution),
        observations: normalizeString(args?.observations),
        type: resolveType(config, args?.type),
        status: resolveStatus(config, args?.status),
        priority: resolvePriority(config, args?.priority),
        createdAt: now,
        updatedAt: now,
        updatedBy: normalizeString(args?.updatedBy)
      };
      const targetPath = resolveBacklogPath(root, backlogPathArg);
      await ensureBacklogFile(targetPath);
      const targetEntry = files.find((file) => file.path === targetPath);
      const targetTasks = targetEntry ? targetEntry.tasks : await loadTasksFromFile(targetPath);
      targetTasks.push(task);
      await writeTasks(targetPath, targetTasks);
      writeJson({ ok: true, task: decorateTask(task, targetPath) });
      return;
    }

    if (toolName === 'task_update') {
      const id = normalizeString(args?.id);
      if (!id) throw new Error('task_update requires an "id" string.');
      if (!backlogPathArg) {
        writeJson({ ok: false, error: 'backlogPath is required.' });
        return;
      }
      const match = byId.get(id);
      if (!match) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      const sourcePath = resolveBacklogPath(root, backlogPathArg);
      const fileEntry = files.find((file) => file.path === sourcePath);
      const fileTasks = fileEntry ? fileEntry.tasks : await loadTasksFromFile(sourcePath);
      const taskIndex = fileTasks.findIndex((entry) => normalizeString(entry.id) === id);
      if (taskIndex < 0) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      const task = fileTasks[taskIndex];
      const expectedHash = normalizeString(args?.ifMatch);
      const allowOverwrite = Boolean(args?.force);
      if (expectedHash && !allowOverwrite) {
        const currentHash = taskHash(task);
        if (currentHash !== expectedHash) {
          writeJson({
            ok: false,
            error: 'Task was modified by someone else.',
            conflict: {
              current: decorateTask(task, sourcePath),
              incoming: decorateTask({ ...task, ...args }, sourcePath)
            }
          });
          return;
        }
      }
      if (args?.description !== undefined) task.description = normalizeString(args.description);
      if (args?.proposedSolution !== undefined) task.proposedSolution = normalizeString(args.proposedSolution);
      if (args?.observations !== undefined) task.observations = normalizeString(args.observations);
      if (args?.type !== undefined) task.type = resolveType(config, args.type);
      if (args?.status !== undefined) task.status = resolveStatus(config, args.status);
      if (args?.priority !== undefined) task.priority = resolvePriority(config, args.priority);
      if (args?.updatedBy !== undefined) task.updatedBy = normalizeString(args.updatedBy);
      delete task.title;
      task.updatedAt = new Date().toISOString();
      fileTasks[taskIndex] = task;
      await writeTasks(sourcePath, fileTasks);
      writeJson({ ok: true, task: decorateTask(task, sourcePath) });
      return;
    }

    if (toolName === 'task_delete') {
      const id = normalizeString(args?.id);
      if (!id) throw new Error('task_delete requires an "id" string.');
      if (!backlogPathArg) {
        writeJson({ ok: false, error: 'backlogPath is required.' });
        return;
      }
      const match = byId.get(id);
      if (!match) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      const sourcePath = resolveBacklogPath(root, backlogPathArg);
      const fileEntry = files.find((file) => file.path === sourcePath);
      const fileTasks = fileEntry ? fileEntry.tasks : await loadTasksFromFile(sourcePath);
      const next = fileTasks.filter((t) => normalizeString(t.id) !== id);
      if (next.length === fileTasks.length) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      await writeTasks(sourcePath, next);
      writeJson({ ok: true, deleted: id });
      return;
    }

    writeJson({ ok: false, error: `Unknown tool: ${toolName}` });
  } catch (error) {
    writeJson({ ok: false, error: String(error?.message || error) });
  }
}

main().catch((error) => {
  writeJson({ ok: false, error: String(error?.message || error) });
});
