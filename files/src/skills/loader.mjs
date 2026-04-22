import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Parse YAML-like frontmatter from SKILL.md content.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\S[\w-]*)\s*:\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      // Handle arrays: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else if (val === 'true') {
        val = true;
      } else if (val === 'false') {
        val = false;
      }
      meta[key] = val;
    }
  }
  return { meta, body: match[2] };
}

/**
 * Substitute $ARGUMENTS and !`cmd` in skill body.
 */
function renderSkillBody(body, args, skillDir) {
  let result = body;

  // Replace $ARGUMENTS with full args string
  result = result.replace(/\$ARGUMENTS/g, args);

  // Replace $ARGUMENTS[N] or $N with positional args
  const parts = args.split(/\s+/).filter(Boolean);
  result = result.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, n) => parts[parseInt(n)] ?? '');
  result = result.replace(/\$(\d+)/g, (_, n) => parts[parseInt(n)] ?? '');

  // Replace ${CLAUDE_SKILL_DIR}
  if (skillDir) {
    result = result.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir);
  }

  // Execute !`cmd` blocks and inject output
  result = result.replace(/!`([^`]+)`/g, (_, cmd) => {
    try {
      return execSync(cmd, {
        encoding: 'utf-8',
        timeout: 10000,
        cwd: skillDir || process.cwd(),
      }).trim();
    } catch (err) {
      return `[command failed: ${cmd}]`;
    }
  });

  return result;
}

/**
 * Skill loader — discovers SKILL.md files and legacy commands.
 *
 * Discovery locations (in priority order):
 * 1. ~/.claude/skills/<name>/SKILL.md
 * 2. .claude/skills/<name>/SKILL.md (project)
 * 3. ~/.claude/commands/<name>.md (legacy)
 * 4. .claude/commands/<name>.md (legacy project)
 */
export class SkillLoader {
  #skills = new Map();

  async discover(claudeDir, projectDir) {
    const dirs = [
      // Personal skills
      { base: join(claudeDir, 'skills'), type: 'skill' },
      // Project skills
      { base: join(projectDir, '.claude', 'skills'), type: 'skill' },
      // Legacy personal commands
      { base: join(claudeDir, 'commands'), type: 'command' },
      // Legacy project commands
      { base: join(projectDir, '.claude', 'commands'), type: 'command' },
    ];

    for (const { base, type } of dirs) {
      try {
        const entries = await readdir(base, { withFileTypes: true });
        for (const entry of entries) {
          if (type === 'skill' && entry.isDirectory()) {
            // Directory-based skill: <name>/SKILL.md
            const skillFile = join(base, entry.name, 'SKILL.md');
            const content = await safeRead(skillFile);
            if (content) {
              const { meta, body } = parseFrontmatter(content);
              const name = meta.name || entry.name;
              if (!this.#skills.has(name)) {
                this.#skills.set(name, {
                  name,
                  meta,
                  body,
                  dir: join(base, entry.name),
                  path: skillFile,
                  type: 'skill',
                });
              }
            }
          } else if (type === 'command' && entry.isFile() && entry.name.endsWith('.md')) {
            // Legacy command: <name>.md
            const name = basename(entry.name, '.md');
            if (!this.#skills.has(name)) {
              const content = await safeRead(join(base, entry.name));
              if (content) {
                const { meta, body } = parseFrontmatter(content);
                this.#skills.set(name, {
                  name,
                  meta,
                  body,
                  dir: base,
                  path: join(base, entry.name),
                  type: 'command',
                });
              }
            }
          }
        }
      } catch {
        // Directory doesn't exist — skip
      }
    }
  }

  /**
   * Get a skill by name.
   */
  getSkill(name) {
    return this.#skills.get(name) ?? null;
  }

  /**
   * List all user-invocable skills.
   */
  listUserSkills() {
    return [...this.#skills.values()]
      .filter(s => s.meta['user-invocable'] !== false)
      .map(s => ({
        name: s.name,
        description: s.meta.description || '',
        argumentHint: s.meta['argument-hint'] || '',
        type: s.type,
      }));
  }

  /**
   * List all skills (including non-user-invocable) for system prompt.
   */
  listAllSkills() {
    return [...this.#skills.values()];
  }

  /**
   * Render a skill for invocation — substitutes args and runs !`cmd` blocks.
   */
  renderSkill(name, argsString) {
    const skill = this.#skills.get(name);
    if (!skill) return null;

    const rendered = renderSkillBody(skill.body, argsString, skill.dir);
    return {
      name: skill.name,
      content: rendered,
      meta: skill.meta,
    };
  }
}

async function safeRead(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}
