import { createInterface } from 'node:readline';
import chalk from 'chalk';

export function createPrompt() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: process.stdin.isTTY ?? false,
    historySize: 200,
  });

  let closed = false;

  rl.on('close', () => { closed = true; });

  return { ask, close };

  function ask(promptText = '> ') {
    if (closed) return Promise.resolve(null);

    return new Promise((resolve) => {
      let resolved = false;

      const done = (val) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };

      rl.once('close', () => done(null));

      rl.question(chalk.bold.blue(promptText), (answer) => {
        done(answer?.trim() ?? null);
      });
    });
  }

  function close() {
    if (!closed) {
      rl.close();
      closed = true;
    }
  }
}
