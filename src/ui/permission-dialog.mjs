import { createInterface } from 'node:readline';
import chalk from 'chalk';

/**
 * Show a permission prompt to the user.
 * Returns: 'yes', 'no', or 'always'
 */
export async function askPermission(toolName, input) {
  const summary = formatToolSummary(toolName, input);
  process.stderr.write(chalk.yellow(`\n  ⚡ ${toolName}`));
  if (summary) process.stderr.write(chalk.dim(` ${summary}`));
  process.stderr.write('\n');

  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });

  return new Promise((resolve) => {
    rl.question(chalk.yellow('  Allow? [y/n/a(lways)] '), (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'a' || a === 'always') resolve('always');
      else if (a === 'y' || a === 'yes' || a === '') resolve('yes');
      else resolve('no');
    });
  });
}

function formatToolSummary(toolName, input) {
  if (!input) return '';
  if (toolName === 'Bash') return input.command ? truncate(input.command, 80) : '';
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') return input.file_path ?? '';
  return '';
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
