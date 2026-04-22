import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseJsonc } from 'jsonc-parser';

const HOME = homedir();
const CLAUDE_DIR = join(HOME, '.claude');

const DEFAULTS = Object.freeze({
  model: 'claude-sonnet-4-6',
  maxTokens: 16384,
  maxThinkingTokens: 10000,
  thinkingEnabled: false,
  temperature: 1,
  apiBaseUrl: 'https://api.anthropic.com',
  sessionDir: join(CLAUDE_DIR, 'sessions'),
  memoryDir: null, // resolved per-project
  permissionMode: 'ask', // ask | plan | auto
});

async function loadJsoncFile(path) {
  try {
    const text = await readFile(path, 'utf-8');
    return parseJsonc(text) ?? {};
  } catch {
    return {};
  }
}

export async function loadConfig(projectDir = process.cwd()) {
  const globalSettings = await loadJsoncFile(join(CLAUDE_DIR, 'settings.json'));
  const projectSettings = await loadJsoncFile(join(projectDir, '.claude', 'settings.json'));

  const env = process.env;
  const apiKey = env.ANTHROPIC_API_KEY ?? '';

  const merged = { ...DEFAULTS, ...globalSettings, ...projectSettings };

  if (env.CLAUDE_MODEL) merged.model = env.CLAUDE_MODEL;
  if (env.ANTHROPIC_BASE_URL) merged.apiBaseUrl = env.ANTHROPIC_BASE_URL;
  if (env.MAX_THINKING_TOKENS) merged.maxThinkingTokens = parseInt(env.MAX_THINKING_TOKENS, 10);

  // Resolve memory dir for project
  const projectId = projectDir.replace(/\//g, '-').replace(/^-/, '');
  merged.memoryDir = join(CLAUDE_DIR, 'projects', projectId, 'memory');

  return Object.freeze({ ...merged, apiKey, projectDir, claudeDir: CLAUDE_DIR });
}

export { CLAUDE_DIR, HOME };
