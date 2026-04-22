import { BaseTool } from './base-tool.mjs';
import { spawn } from 'node:child_process';

export default class BashTool extends BaseTool {
  get name() { return 'Bash'; }

  get schema() {
    return {
      description: 'Execute a bash command and return its output.',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        description: { type: 'string', description: 'Description of the command' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (max 600000)' },
      },
      required: ['command'],
    };
  }

  async execute(input, context) {
    const { command, timeout = 120000 } = input;
    const effectiveTimeout = Math.min(timeout, 600000);

    return new Promise((resolve) => {
      const proc = spawn('/bin/sh', ['-c', command], {
        cwd: context?.cwd ?? process.cwd(),
        timeout: effectiveTimeout,
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('error', (err) => {
        resolve({ content: `Error: ${err.message}`, isError: true });
      });

      proc.on('close', (code) => {
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n' : '') + stderr;
        if (!output) output = `(no output, exit code ${code})`;

        // Truncate very large output
        if (output.length > 100000) {
          output = output.slice(0, 50000) + '\n... (truncated) ...\n' + output.slice(-50000);
        }

        resolve({
          content: code !== 0
            ? `Exit code ${code}\n${output}`
            : output,
          isError: code !== 0,
        });
      });

      if (context?.abortSignal) {
        context.abortSignal.addEventListener('abort', () => proc.kill());
      }
    });
  }
}
