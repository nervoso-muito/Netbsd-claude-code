import { BaseTool } from './base-tool.mjs';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

export default class GrepTool extends BaseTool {
  get name() { return 'Grep'; }

  get schema() {
    return {
      description: 'Search file contents using regex. Uses rg if available, falls back to grep.',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in' },
        glob: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.js")' },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Output mode (default: files_with_matches)',
        },
        '-i': { type: 'boolean', description: 'Case insensitive' },
        '-n': { type: 'boolean', description: 'Show line numbers' },
        '-C': { type: 'number', description: 'Context lines' },
        '-A': { type: 'number', description: 'Lines after match' },
        '-B': { type: 'number', description: 'Lines before match' },
        head_limit: { type: 'number', description: 'Limit results' },
      },
      required: ['pattern'],
    };
  }

  async execute(input, context) {
    const searchPath = input.path ?? context?.cwd ?? process.cwd();
    const hasRg = await commandExists('rg');

    const args = hasRg
      ? this.#buildRgArgs(input, searchPath)
      : this.#buildGrepArgs(input, searchPath);

    const cmd = hasRg ? 'rg' : 'grep';

    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd: context?.cwd ?? process.cwd(),
        timeout: 30000,
      });

      let output = '';
      proc.stdout.on('data', (d) => { output += d.toString(); });
      proc.stderr.on('data', (d) => { output += d.toString(); });

      proc.on('close', (code) => {
        if (code > 1) {
          resolve({ content: `Grep error (exit ${code}): ${output}`, isError: true });
        } else if (!output.trim()) {
          resolve({ content: 'No matches found.' });
        } else {
          let result = output.trim();
          if (input.head_limit) {
            const lines = result.split('\n');
            result = lines.slice(0, input.head_limit).join('\n');
          }
          resolve({ content: result });
        }
      });
    });
  }

  #buildRgArgs(input, searchPath) {
    const args = [];
    const mode = input.output_mode ?? 'files_with_matches';

    if (mode === 'files_with_matches') args.push('-l');
    else if (mode === 'count') args.push('-c');

    if (input['-i']) args.push('-i');
    if (input['-n'] !== false && mode === 'content') args.push('-n');
    if (input['-C']) args.push('-C', String(input['-C']));
    if (input['-A']) args.push('-A', String(input['-A']));
    if (input['-B']) args.push('-B', String(input['-B']));
    if (input.glob) args.push('--glob', input.glob);

    args.push('--', input.pattern, searchPath);
    return args;
  }

  #buildGrepArgs(input, searchPath) {
    const args = ['-r'];
    const mode = input.output_mode ?? 'files_with_matches';

    if (mode === 'files_with_matches') args.push('-l');
    else if (mode === 'count') args.push('-c');

    if (input['-i']) args.push('-i');
    if (input['-n'] !== false && mode === 'content') args.push('-n');
    if (input['-C']) args.push('-C', String(input['-C']));
    if (input['-A']) args.push('-A', String(input['-A']));
    if (input['-B']) args.push('-B', String(input['-B']));

    if (input.glob) args.push('--include', input.glob);

    args.push('--', input.pattern, searchPath);
    return args;
  }
}

async function commandExists(cmd) {
  try {
    await access(`/usr/local/bin/${cmd}`);
    return true;
  } catch {
    try {
      await access(`/usr/pkg/bin/${cmd}`);
      return true;
    } catch {
      try {
        await access(`/usr/bin/${cmd}`);
        return true;
      } catch {
        return false;
      }
    }
  }
}
