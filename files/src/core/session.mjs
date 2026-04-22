import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Session management — save/load/list conversations.
 */
export function createSessionManager(sessionDir) {
  return { save, load, list, getSessionDir: () => sessionDir };

  async function save(conversation, metadata = {}) {
    await mkdir(sessionDir, { recursive: true });
    const id = metadata.id ?? randomUUID();
    const session = {
      id,
      version: 1,
      createdAt: metadata.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: metadata.model ?? '',
      messageCount: conversation.length,
      conversation,
    };

    const filePath = join(sessionDir, `${id}.json`);
    await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    return id;
  }

  async function load(id) {
    const filePath = join(sessionDir, `${id}.json`);
    try {
      const text = await readFile(filePath, 'utf-8');
      const session = JSON.parse(text);
      return session;
    } catch (err) {
      return null;
    }
  }

  async function list() {
    try {
      await mkdir(sessionDir, { recursive: true });
      const files = await readdir(sessionDir);
      const sessions = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const text = await readFile(join(sessionDir, file), 'utf-8');
          const s = JSON.parse(text);
          sessions.push({ id: s.id, updatedAt: s.updatedAt, messageCount: s.messageCount, model: s.model });
        } catch { /* skip corrupt files */ }
      }
      sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return sessions;
    } catch {
      return [];
    }
  }
}
