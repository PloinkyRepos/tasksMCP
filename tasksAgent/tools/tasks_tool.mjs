#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONFIG = {
  statuses: {
    'todo': 'Todo',
    'in-progress': 'In Progress',
    'dev-ready': 'Dev Ready',
    'testing': 'Testing',
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
  defaultStatus: 'todo',
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
  return roots.length ? path.resolve(roots[0]) : process.cwd();
}

function configPathForRoot(root) {
  return path.join(root, '.backlog.config.json');
}

function backlogPathForRoot(root) {
  return path.join(root, '.backlog');
}

function normalizeConfig(input) {
  const cfg = input && typeof input === 'object' ? input : {};
  const statuses = cfg.statuses && typeof cfg.statuses === 'object' ? cfg.statuses : DEFAULT_CONFIG.statuses;
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

async function loadConfig(root, { ensure = false } = {}) {
  const configPath = configPathForRoot(root);
  let config = null;
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    config = safeParseJson(raw);
  } catch {
    config = null;
  }
  const normalized = normalizeConfig(config);
  if (ensure && !config) {
    await fs.writeFile(configPath, JSON.stringify(normalized, null, 2));
  }
  return { config: normalized, configPath };
}

async function loadTasks(root) {
  const backlogPath = backlogPathForRoot(root);
  try {
    const raw = await fs.readFile(backlogPath, 'utf8');
    const parsed = safeParseJson(raw);
    if (Array.isArray(parsed)) return { tasks: parsed, backlogPath };
    if (parsed && Array.isArray(parsed.tasks)) return { tasks: parsed.tasks, backlogPath };
  } catch {
    // ignore
  }
  return { tasks: [], backlogPath };
}

async function writeTasks(backlogPath, tasks) {
  const next = Array.isArray(tasks) ? tasks : [];
  const tmpPath = `${backlogPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2));
  await fs.rename(tmpPath, backlogPath);
}

function normalizeString(value) {
  return String(value || '').trim();
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
  const title = normalizeString(task.title).toLowerCase();
  const description = normalizeString(task.description).toLowerCase();
  return title.includes(q) || description.includes(q);
}

function taskMatchesFilters(task, filters) {
  const repoPath = normalizeString(filters.repoPath);
  if (repoPath && normalizeString(task.repoPath) !== repoPath) return false;
  const status = normalizeString(filters.status);
  if (status && normalizeString(task.status) !== status) return false;
  const type = normalizeString(filters.type);
  if (type && normalizeString(task.type) !== type) return false;
  const assignee = normalizeString(filters.assignee).toLowerCase();
  if (assignee && normalizeString(task.assignee).toLowerCase() !== assignee) return false;
  const tag = normalizeString(filters.tag).toLowerCase();
  if (tag) {
    const tags = Array.isArray(task.tags) ? task.tags.map((t) => normalizeString(t).toLowerCase()) : [];
    if (!tags.includes(tag)) return false;
  }
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

  const root = getWorkspaceRoot();
  try {
    if (toolName === 'task_config') {
      const { config, configPath } = await loadConfig(root, { ensure: true });
      writeJson({ ok: true, config, configPath });
      return;
    }

    const { config } = await loadConfig(root);
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
      const title = normalizeString(args?.title);
      const id = generateId(existingIds);
      const now = new Date().toISOString();
      const task = {
        id,
        title,
        description: normalizeString(args?.description),
        observations: normalizeString(args?.observations),
        type: resolveType(config, args?.type),
        status: resolveStatus(config, args?.status),
        repoPath: normalizeString(args?.repoPath),
        tags: normalizeTags(args?.tags, config.allowCustomTags),
        assignee: normalizeString(args?.assignee),
        priority: resolvePriority(config, args?.priority),
        createdAt: now,
        updatedAt: now
      };
      tasks.push(task);
      await writeTasks(backlogPath, tasks);
      writeJson({ ok: true, task });
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
      if (args?.title !== undefined) task.title = normalizeString(args.title);
      if (args?.description !== undefined) task.description = normalizeString(args.description);
      if (args?.observations !== undefined) task.observations = normalizeString(args.observations);
      if (args?.type !== undefined) task.type = resolveType(config, args.type);
      if (args?.status !== undefined) task.status = resolveStatus(config, args.status);
      if (args?.repoPath !== undefined) task.repoPath = normalizeString(args.repoPath);
      if (args?.tags !== undefined) task.tags = normalizeTags(args.tags, config.allowCustomTags);
      if (args?.assignee !== undefined) task.assignee = normalizeString(args.assignee);
      if (args?.priority !== undefined) task.priority = resolvePriority(config, args.priority);
      task.updatedAt = new Date().toISOString();
      await writeTasks(backlogPath, tasks);
      writeJson({ ok: true, task });
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
