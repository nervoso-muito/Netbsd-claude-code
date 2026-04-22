import { createTwoFilesPatch } from 'diff';
import chalk from 'chalk';

/**
 * Render a colored diff between old and new content.
 */
export function renderDiff(filePath, oldContent, newContent) {
  const patch = createTwoFilesPatch(filePath, filePath, oldContent, newContent, 'before', 'after');
  const lines = patch.split('\n');

  return lines.map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
    if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
    if (line.startsWith('@@')) return chalk.cyan(line);
    return chalk.dim(line);
  }).join('\n');
}

/**
 * Show a compact summary of an edit operation.
 */
export function renderEditSummary(filePath, oldStr, newStr) {
  const oldLines = oldStr.split('\n').length;
  const newLines = newStr.split('\n').length;
  const diff = newLines - oldLines;
  const sign = diff >= 0 ? '+' : '';
  return chalk.dim(`  ${filePath} (${sign}${diff} lines)`);
}
