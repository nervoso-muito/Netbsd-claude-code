import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { parse as parseJsonc } from 'jsonc-parser';

/**
 * Hook engine — runs shell commands before/after tool use and at session end.
 *
 * Hooks are configured in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{ "matcher": "Bash", "command": "echo pre-bash" }],
 *     "PostToolUse": [{ "matcher": "*", "command": "echo post-any" }],
 *     "Stop": [{ "command": "echo session ended" }]
 *   }
 * }
 */
export class HookEngine {
  #hooks = { PreToolUse: [], PostToolUse: [], Stop: [] };

  async loadFromConfig(claudeDir) {
    try {
      const settingsPath = join(claudeDir, 'settings.json');
      const text = await readFile(settingsPath, 'utf-8');
      const settings = parseJsonc(text) ?? {};
      if (settings.hooks) {
        for (const [type, hooks] of Object.entries(settings.hooks)) {
          if (this.#hooks[type]) {
            this.#hooks[type] = Array.isArray(hooks) ? hooks : [];
          }
        }
      }
    } catch {
      // No hooks configured
    }
  }

  async runPreToolUse(toolName, input) {
    return this.#runHooks('PreToolUse', toolName, { tool: toolName, input });
  }

  async runPostToolUse(toolName, input, result) {
    return this.#runHooks('PostToolUse', toolName, { tool: toolName, input, result });
  }

  async runStop() {
    return this.#runHooks('Stop', null, {});
  }

  async #runHooks(type, toolName, context) {
    const hooks = this.#hooks[type];
    const results = [];

    for (const hook of hooks) {
      if (hook.matcher && hook.matcher !== '*' && hook.matcher !== toolName) continue;

      try {
        const output = await this.#execCommand(hook.command, context);
        results.push({ hook: hook.command, output, success: true });
      } catch (err) {
        results.push({ hook: hook.command, error: err.message, success: false });
      }
    }

    return results;
  }

  #execCommand(command, context) {
    return new Promise((resolve, reject) => {
      const proc = spawn('/bin/sh', ['-c', command], {
        timeout: 10000,
        env: {
          ...process.env,
          NCC_HOOK_CONTEXT: JSON.stringify(context),
        },
      });

      let output = '';
      proc.stdout.on('data', (d) => { output += d.toString(); });
      proc.stderr.on('data', (d) => { output += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(output.trim());
        else reject(new Error(`Hook exited with code ${code}: ${output.trim()}`));
      });

      proc.on('error', reject);
    });
  }
}
