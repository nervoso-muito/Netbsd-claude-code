import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

/**
 * Skill loader — discovers SKILL.md files and makes them available.
 *
 * Skills are markdown files in:
 * - ~/.claude/skills/
 * - .claude/skills/ (project-level)
 *
 * Each skill file can have a TRIGGER section that defines when to auto-invoke.
 */
export class SkillLoader {
  #skills = new Map();

  async loadFromDirs(dirs) {
    for (const dir of dirs) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
          const name = basename(entry.name, '.md');
          const content = await readFile(join(dir, entry.name), 'utf-8');
          const trigger = extractTrigger(content);
          this.#skills.set(name, { name, content, trigger, path: join(dir, entry.name) });
        }
      } catch {
        // Directory doesn't exist — skip
      }
    }
  }

  getSkill(name) {
    return this.#skills.get(name) ?? null;
  }

  listSkills() {
    return [...this.#skills.values()].map(s => ({
      name: s.name,
      trigger: s.trigger,
      path: s.path,
    }));
  }

  findMatchingSkill(userMessage) {
    for (const skill of this.#skills.values()) {
      if (skill.trigger && matchesTrigger(skill.trigger, userMessage)) {
        return skill;
      }
    }
    return null;
  }
}

function extractTrigger(content) {
  const match = content.match(/^TRIGGER\s*(?:when)?:\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

function matchesTrigger(trigger, message) {
  // Simple keyword matching — triggers like "user asks about X"
  const keywords = trigger.toLowerCase().split(/[,;|]+/).map(k => k.trim());
  const lower = message.toLowerCase();
  return keywords.some(k => lower.includes(k));
}
