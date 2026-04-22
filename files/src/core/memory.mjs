import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Build system prompt from CLAUDE.md files and memory.
 * Searches: project dir ancestors, ~/.claude/, memory dir.
 */
export async function buildSystemPrompt(config) {
  const parts = [];

  // 1. Load CLAUDE.md from project dir and ancestors
  const claudeMds = await findClaudeMdFiles(config.projectDir);
  for (const file of claudeMds) {
    const content = await safeRead(file);
    if (content) parts.push(`# Instructions from ${file}\n\n${content}`);
  }

  // 2. Load global CLAUDE.md
  const globalMd = join(config.claudeDir, 'CLAUDE.md');
  const globalContent = await safeRead(globalMd);
  if (globalContent) parts.push(`# Global Instructions\n\n${globalContent}`);

  // 3. Load auto-memory MEMORY.md
  if (config.memoryDir) {
    const memoryMd = join(config.memoryDir, 'MEMORY.md');
    const memoryContent = await safeRead(memoryMd);
    if (memoryContent) parts.push(`# Auto Memory\n\n${memoryContent}`);
  }

  // 4. Load rules from ~/.claude/rules/
  const rulesDir = join(config.claudeDir, 'rules');
  const rulesContent = await loadRulesDir(rulesDir);
  if (rulesContent) parts.push(`# Rules\n\n${rulesContent}`);

  return parts.join('\n\n---\n\n');
}

async function findClaudeMdFiles(startDir) {
  const files = [];
  let dir = resolve(startDir);
  const root = '/';

  while (dir !== root) {
    const candidate = join(dir, 'CLAUDE.md');
    if (existsSync(candidate)) files.unshift(candidate);
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return files;
}

async function loadRulesDir(rulesDir) {
  try {
    const entries = await readdir(rulesDir, { withFileTypes: true, recursive: true });
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => join(e.parentPath ?? e.path, e.name));

    const contents = [];
    for (const f of mdFiles) {
      const c = await safeRead(f);
      if (c) contents.push(c);
    }
    return contents.join('\n\n');
  } catch {
    return '';
  }
}

async function safeRead(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}
