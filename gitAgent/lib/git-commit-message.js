import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function stripFences(text) {
  return String(text || '')
    .trim()
    .replace(/^\s*```[\s\S]*?\n/, '')
    .replace(/\n```[\s\S]*$/m, '')
    .trim();
}

async function loadWorkspaceLlmModule(workspaceRoot) {
  if (!workspaceRoot) {
    throw new Error('WORKSPACE_ROOT is not set; cannot locate achillesAgentLib.');
  }
  const modulePath = path.join(workspaceRoot, 'node_modules', 'achillesAgentLib', 'LLMAgents', 'index.mjs');
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error(`LLM library not found at ${modulePath}. Ensure Ploinky dependencies are installed in the workspace.`);
  }
  return import(pathToFileURL(modulePath).href);
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveWorkspaceRoot(context = {}) {
  const envCandidates = [
    context.workspaceRoot,
    process.env.WORKSPACE_ROOT,
    process.env.ASSISTOS_FS_ROOT,
    process.env.PLOINKY_WORKSPACE_ROOT
  ].filter((value) => typeof value === 'string' && value.trim());

  const baseCandidates = [
    ...envCandidates,
    '/workspace',
    '/code',
    '/Agent',
    '/',
    process.cwd()
  ];

  const moduleSuffix = path.join('node_modules', 'achillesAgentLib', 'LLMAgents', 'index.mjs');

  for (const base of baseCandidates) {
    const modulePath = path.join(base, moduleSuffix);
    if (await pathExists(modulePath)) {
      return base;
    }
  }

  let current = process.cwd();
  while (current && current !== path.dirname(current)) {
    const modulePath = path.join(current, moduleSuffix);
    if (await pathExists(modulePath)) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new Error('WORKSPACE_ROOT is not set and achillesAgentLib was not found.');
}

function buildPrompt(diffs) {
  const header = [
    'You are generating a Git commit message from code diffs.',
    'Return ONLY the commit message text (no markdown fences, no explanations).',
    'Rules:',
    '- First line: imperative mood, <= 72 chars.',
    '- Optional blank line then bullet list (max 6 bullets).',
    '- Be specific: mention key parts touched.',
    '',
    'Diffs (working tree vs HEAD):'
  ].join('\n');

  const MAX_CHARS_PER_DIFF = 12_000;
  const MAX_TOTAL_CHARS = 120_000;

  let prompt = header;
  for (const item of diffs) {
    if (prompt.length >= MAX_TOTAL_CHARS) break;
    const diffText = String(item?.diff || '').slice(0, MAX_CHARS_PER_DIFF);
    const segment = `\n\n[repo] ${item?.repoPath || ''}\n[file] ${item?.filePath || ''}\n[diff]\n${diffText}\n[/diff]`;
    if (prompt.length + segment.length > MAX_TOTAL_CHARS) break;
    prompt += segment;
  }
  return prompt;
}

export default async function gitCommitMessage(input, context = {}) {
  let payload = input;
  if (typeof payload === 'string') {
    const parsed = safeParseJson(payload.trim());
    if (parsed) payload = parsed;
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid input. Expected { diffs: [...] }.');
  }

  const diffs = Array.isArray(payload.diffs) ? payload.diffs : [];
  if (!diffs.length) {
    throw new Error('No diffs provided.');
  }

  const workspaceRoot = await resolveWorkspaceRoot(context);
  const llm = await loadWorkspaceLlmModule(workspaceRoot);
  const agent = (typeof llm.getDefaultLLMAgent === 'function' && llm.getDefaultLLMAgent())
    || (typeof llm.registerDefaultLLMAgent === 'function' && llm.registerDefaultLLMAgent());
  if (!agent) {
    throw new Error('No default LLM agent available.');
  }

  const prompt = buildPrompt(diffs);
  const raw = await agent.executePrompt(prompt, { mode: 'fast', responseShape: 'text' });
  const message = stripFences(raw);
  if (!message) {
    throw new Error('AI returned an empty commit message.');
  }
  return message;
}
