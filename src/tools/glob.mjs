import { BaseTool } from './base-tool.mjs';
import fg from 'fast-glob';

export default class GlobTool extends BaseTool {
  get name() { return 'Glob'; }

  get schema() {
    return {
      description: 'Find files matching a glob pattern.',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.js")' },
        path: { type: 'string', description: 'Directory to search in' },
      },
      required: ['pattern'],
    };
  }

  async execute(input, context) {
    const { pattern, path } = input;
    const cwd = path ?? context?.cwd ?? process.cwd();

    try {
      const files = await fg(pattern, {
        cwd,
        absolute: true,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**'],
        stats: true,
        suppressErrors: true,
      });

      // Sort by mtime descending
      files.sort((a, b) => (b.stats?.mtimeMs ?? 0) - (a.stats?.mtimeMs ?? 0));

      const paths = files.map(f => f.path ?? f);
      if (paths.length === 0) {
        return { content: 'No files found matching pattern.' };
      }
      return { content: paths.join('\n') };
    } catch (err) {
      return { content: `Glob error: ${err.message}`, isError: true };
    }
  }
}
