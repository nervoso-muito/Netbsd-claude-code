import chalk from 'chalk';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Simple terminal spinner for progress indication.
 */
export function createSpinner(text = '') {
  let interval = null;
  let frameIdx = 0;

  return { start, stop, update };

  function start(msg) {
    if (msg) text = msg;
    frameIdx = 0;
    interval = setInterval(() => {
      const frame = FRAMES[frameIdx % FRAMES.length];
      process.stderr.write(`\r${chalk.cyan(frame)} ${chalk.dim(text)}`);
      frameIdx++;
    }, 80);
  }

  function stop(finalMsg) {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    process.stderr.write('\r\x1b[K');
    if (finalMsg) process.stderr.write(chalk.dim(`  ${finalMsg}\n`));
  }

  function update(msg) {
    text = msg;
  }
}
