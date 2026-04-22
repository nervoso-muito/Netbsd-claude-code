import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

const marked = new Marked(markedTerminal({
  reflowText: true,
  width: process.stdout.columns ?? 80,
  tab: 2,
}));

/**
 * Render markdown text for terminal output.
 */
export function renderMarkdown(text) {
  try {
    return marked.parse(text);
  } catch {
    return text;
  }
}

/**
 * Render a code block with syntax highlighting label.
 */
export function renderCodeBlock(code, language = '') {
  const header = language ? chalk.dim(`── ${language} ──`) : chalk.dim('────');
  return `\n${header}\n${code}\n${chalk.dim('────')}\n`;
}
