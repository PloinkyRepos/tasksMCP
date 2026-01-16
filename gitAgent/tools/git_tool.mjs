#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createGitService } from '../lib/git-service.mjs';
import { textResponse, jsonResponse, errorResponse } from '../lib/responses.mjs';
import gitCommitMessage from '../lib/git-commit-message.js';

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
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

function getWorkspaceRoots() {
  const roots = [
    process.env.ASSISTOS_FS_ROOT,
    process.env.WORKSPACE_ROOT,
    process.env.PLOINKY_WORKSPACE_ROOT
  ].filter((value) => typeof value === 'string' && value.trim());
  if (!roots.length) {
    roots.push(process.cwd());
  }
  return roots.map((root) => path.resolve(root));
}

function isWithinRoots(absPath, roots) {
  const resolved = path.resolve(absPath);
  return roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

function validatePathArg(p, roots) {
  if (typeof p !== 'string' || !p.trim()) {
    throw new Error('Path must be a non-empty string.');
  }
  if (p.includes('\0')) {
    throw new Error('Invalid path (contains null byte).');
  }
  const candidate = p.trim();
  if (path.isAbsolute(candidate)) {
    if (!isWithinRoots(candidate, roots)) {
      throw new Error('Path is outside allowed roots.');
    }
    return candidate;
  }
  const root = roots[0];
  const safePart = candidate.startsWith('/') ? candidate.slice(1) : candidate;
  const resolved = path.join(root, safePart);
  if (!isWithinRoots(resolved, roots)) {
    throw new Error('Path is outside allowed roots.');
  }
  return resolved;
}

function normalizeArgs(toolName, args) {
  const input = args && typeof args === 'object' ? { ...args } : {};
  const requirePath = () => {
    if (!input.path || typeof input.path !== 'string') {
      throw new Error(`${toolName} requires a "path" string.`);
    }
  };

  switch (toolName) {
    case 'git_info':
    case 'git_status':
    case 'git_diagnose':
    case 'git_identity':
      requirePath();
      return input;
    case 'git_diff':
      requirePath();
      if (!input.file || typeof input.file !== 'string') {
        throw new Error('git_diff requires a "file" string.');
      }
      input.cached = Boolean(input.cached || false);
      input.ref = input.ref ?? null;
      return input;
    case 'git_stage':
    case 'git_unstage':
    case 'git_untrack':
    case 'git_check_ignore':
    case 'git_restore':
      requirePath();
      input.files = Array.isArray(input.files) ? input.files : [];
      return input;
    case 'git_conflict_versions':
      requirePath();
      if (!input.file || typeof input.file !== 'string') {
        throw new Error('git_conflict_versions requires a "file" string.');
      }
      return input;
    case 'git_checkout_conflict':
      requirePath();
      if (!input.file || typeof input.file !== 'string') {
        throw new Error('git_checkout_conflict requires a "file" string.');
      }
      if (!input.source || !['ours', 'theirs'].includes(input.source)) {
        throw new Error('git_checkout_conflict requires source to be "ours" or "theirs".');
      }
      return input;
    case 'git_stash':
      requirePath();
      input.includeUntracked = input.includeUntracked !== false;
      input.message = typeof input.message === 'string' ? input.message : '';
      return input;
    case 'git_stash_pop':
      requirePath();
      input.ref = input.ref ?? null;
      input.reinstateIndex = input.reinstateIndex !== false;
      return input;
    case 'git_commit':
      requirePath();
      input.message = typeof input.message === 'string' ? input.message : '';
      input.amend = Boolean(input.amend || false);
      input.signoff = Boolean(input.signoff || false);
      input.userName = input.userName ?? null;
      input.userEmail = input.userEmail ?? null;
      return input;
    case 'git_push':
      requirePath();
      input.remote = input.remote ?? null;
      input.branch = input.branch ?? null;
      input.setUpstream = Boolean(input.setUpstream || false);
      input.token = input.token ?? null;
      return input;
    case 'git_pull':
      requirePath();
      input.remote = input.remote ?? null;
      input.branch = input.branch ?? null;
      input.rebase = Boolean(input.rebase || false);
      input.ffOnly = input.ffOnly !== false;
      input.token = input.token ?? null;
      return input;
    case 'git_repos_overview':
      requirePath();
      if (typeof input.maxRepos !== 'number') {
        input.maxRepos = 200;
      }
      return input;
    case 'git_set_identity':
      requirePath();
      input.scope = input.scope || 'local';
      if (!input.name || !input.email) {
        throw new Error('git_set_identity requires name and email.');
      }
      return input;
    case 'git_commit_message':
      if (!Array.isArray(input.diffs)) {
        throw new Error('git_commit_message requires diffs array.');
      }
      return input;
    default:
      throw new Error(`Unsupported tool: ${toolName}`);
  }
}

async function main() {
  const toolName = process.env.TOOL_NAME || process.argv[2];
  if (!toolName) {
    process.stdout.write(JSON.stringify(errorResponse('Missing TOOL_NAME.')));
    return;
  }

  const raw = await fs.readFile(0, 'utf8').catch(() => '');
  const envelope = raw && raw.trim() ? safeParseJson(raw) : null;
  const args = normalizeInput(envelope || {});

  try {
    if (toolName === 'git_commit_message') {
      const payload = normalizeArgs(toolName, args);
      const message = await gitCommitMessage(payload, { workspaceRoot: process.env.WORKSPACE_ROOT || process.env.ASSISTOS_FS_ROOT || '' });
      process.stdout.write(JSON.stringify(textResponse(message)));
      return;
    }

    const roots = getWorkspaceRoots();
    const validatePath = (p) => validatePathArg(p, roots);
    const gitService = createGitService({ validatePath });

    const payload = normalizeArgs(toolName, args);
    let result;
    switch (toolName) {
      case 'git_info':
        result = await gitService.gitInfo(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_status':
        result = await gitService.gitStatus(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_diff':
        result = await gitService.gitDiff(payload);
        process.stdout.write(JSON.stringify(textResponse(result || '')));
        return;
      case 'git_stage':
        result = await gitService.gitStage(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_unstage':
        result = await gitService.gitUnstage(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_untrack':
        result = await gitService.gitUntrack(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_check_ignore':
        result = await gitService.gitCheckIgnore(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_restore':
        result = await gitService.gitRestore(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_conflict_versions':
        result = await gitService.gitConflictVersions(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_checkout_conflict':
        result = await gitService.gitCheckoutConflict(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_stash':
        result = await gitService.gitStash(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_stash_pop':
        result = await gitService.gitStashPop(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_commit':
        result = await gitService.gitCommit(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_push':
        result = await gitService.gitPush(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_pull':
        result = await gitService.gitPull(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_diagnose':
        result = await gitService.gitDiagnose(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_repos_overview':
        result = await gitService.gitReposOverview(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_identity':
        result = await gitService.gitIdentity(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      case 'git_set_identity':
        result = await gitService.gitSetIdentity(payload);
        process.stdout.write(JSON.stringify(jsonResponse(result)));
        return;
      default:
        throw new Error(`Unsupported tool: ${toolName}`);
    }
  } catch (error) {
    const message = error?.message || String(error);
    process.stdout.write(JSON.stringify(errorResponse(message)));
  }
}

main();
