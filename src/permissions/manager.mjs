import { needsPermission, isSafeBashCommand } from './rules.mjs';

/**
 * Permission manager — controls tool execution approval.
 * Modes: ask (default), plan (always ask), auto (never ask).
 */
export function createPermissionManager(initialMode = 'ask') {
  let mode = initialMode;
  const alwaysAllowed = new Set(); // Tools user has "always allowed"
  let askFn = null; // Set by UI to prompt user

  return {
    getMode() { return mode; },
    setMode(m) { mode = m; },
    setAskFn(fn) { askFn = fn; },

    async checkPermission(toolName, input) {
      // Auto mode — approve everything
      if (mode === 'auto') return { allowed: true };

      // Already always-allowed by user
      if (alwaysAllowed.has(toolName)) return { allowed: true };

      // Check if permission is needed
      if (!needsPermission(toolName, mode)) return { allowed: true };

      // Special: safe bash commands in ask mode
      if (toolName === 'Bash' && mode === 'ask' && input?.command && isSafeBashCommand(input.command)) {
        return { allowed: true };
      }

      // Ask user
      if (askFn) {
        const response = await askFn(toolName, input);
        if (response === 'always') {
          alwaysAllowed.add(toolName);
          return { allowed: true };
        }
        return { allowed: response === 'yes' };
      }

      // No ask function — deny by default
      return { allowed: false, reason: 'No permission handler configured' };
    },
  };
}
