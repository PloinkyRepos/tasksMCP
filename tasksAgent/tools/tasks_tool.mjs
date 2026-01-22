#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

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
  const workspaceRoot = getWorkspaceRoot();
  if (!path.isAbsolute(repoPath)) {
    const safePart = repoPath.startsWith('/') ? repoPath.slice(1) : repoPath;
    return path.join(workspaceRoot, safePart);
  }
  if (repoPath.startsWith('/.ploinky/repos')) {
    const safePart = repoPath.replace(/^\/+/, '');
    return path.join(workspaceRoot, safePart);
  }
  return path.resolve(repoPath);
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

async function loadTasks(root) {
  const backlogPath = backlogPathForRoot(root);
  try {
    const raw = await fs.readFile(backlogPath, 'utf8');
    const parsed = safeParseJson(raw);
    if (Array.isArray(parsed)) return { tasks: mergeTasksById(parsed.map(normalizeTask)), backlogPath };
    if (parsed && Array.isArray(parsed.tasks)) return { tasks: mergeTasksById(parsed.tasks.map(normalizeTask)), backlogPath };
  } catch {
    // ignore
  }
  return { tasks: [], backlogPath };
}

async function writeTasks(backlogPath, tasks) {
  const next = Array.isArray(tasks) ? mergeTasksById(tasks.map(normalizeTask)) : [];
  const tmpPath = `${backlogPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2));
  await fs.rename(tmpPath, backlogPath);
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

function mergeTasksById(tasks) {
  const byId = new Map();
  const list = Array.isArray(tasks) ? tasks : [];
  for (const task of list) {
    if (!task || typeof task !== 'object') continue;
    const id = normalizeString(task.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, task);
      continue;
    }
    const nextDate = Date.parse(task.updatedAt || '');
    const prevDate = Date.parse(existing.updatedAt || '');
    if (!Number.isNaN(nextDate) && (Number.isNaN(prevDate) || nextDate >= prevDate)) {
      byId.set(id, task);
    }
  }
  return Array.from(byId.values());
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
    const { tasks, backlogPath } = await loadTasks(root);
    const existingIds = new Set(tasks.map((task) => normalizeString(task.id)).filter(Boolean));

    if (toolName === 'task_list') {
      const filters = args && typeof args === 'object' ? args : {};
      let filtered = tasks.filter((task) => taskMatchesFilters(task, filters));
      filtered = filtered.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      const limit = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : null;
      if (limit && limit > 0) filtered = filtered.slice(0, limit);
      writeJson({ ok: true, tasks: filtered });
      return;
    }

    if (toolName === 'task_get') {
      const id = normalizeString(args?.id);
      if (!id) throw new Error('task_get requires an "id" string.');
      const task = tasks.find((t) => normalizeString(t.id) === id);
      if (!task) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      writeJson({ ok: true, task });
      return;
    }

    if (toolName === 'task_create') {
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
      tasks.push(task);
      await writeTasks(backlogPath, tasks);
      writeJson({ ok: true, task: normalizeTask(task) });
      return;
    }

    if (toolName === 'task_update') {
      const id = normalizeString(args?.id);
      if (!id) throw new Error('task_update requires an "id" string.');
      const task = tasks.find((t) => normalizeString(t.id) === id);
      if (!task) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
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
      await writeTasks(backlogPath, tasks);
      writeJson({ ok: true, task: normalizeTask(task) });
      return;
    }

    if (toolName === 'task_delete') {
      const id = normalizeString(args?.id);
      if (!id) throw new Error('task_delete requires an "id" string.');
      const next = tasks.filter((t) => normalizeString(t.id) !== id);
      if (next.length === tasks.length) {
        writeJson({ ok: false, error: `Task not found: ${id}` });
        return;
      }
      await writeTasks(backlogPath, next);
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
