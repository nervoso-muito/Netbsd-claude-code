/**
 * Permission rules — classify tools by risk level.
 */

// Tools that only read state — always safe
const READ_ONLY_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoRead',
]);

// Tools that modify local state — require ask/auto permission
const WRITE_TOOLS = new Set([
  'Write', 'Edit', 'Bash', 'TodoWrite', 'NotebookEdit',
]);

// Tools that could have side effects beyond local — always ask
const SIDE_EFFECT_TOOLS = new Set([
  'Agent',
]);

export function classifyTool(toolName) {
  if (READ_ONLY_TOOLS.has(toolName)) return 'read';
  if (WRITE_TOOLS.has(toolName)) return 'write';
  if (SIDE_EFFECT_TOOLS.has(toolName)) return 'side_effect';
  return 'unknown';
}

export function needsPermission(toolName, mode) {
  if (mode === 'auto') return false; // auto-approve everything
  if (mode === 'plan') return true;  // always ask in plan mode

  // Default 'ask' mode: ask for write + side_effect tools
  const classification = classifyTool(toolName);
  return classification !== 'read';
}

// Bash commands that are read-only and can be auto-approved in ask mode
const SAFE_BASH_PATTERNS = [
  /^(ls|pwd|cat|head|tail|wc|file|stat|which|type|echo|date|uname|hostname)\b/,
  /^git\s+(status|log|diff|branch|show|remote|tag)\b/,
  /^(npm|node|python|go)\s+(--version|-v|version)\b/,
];

export function isSafeBashCommand(command) {
  return SAFE_BASH_PATTERNS.some(p => p.test(command.trim()));
}
