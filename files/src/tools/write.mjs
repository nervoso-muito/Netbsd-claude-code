import { BaseTool } from './base-tool.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export default class WriteTool extends BaseTool {
  get name() { return 'Write'; }

  get schema() {
    return {
      description: 'Write content to a file. Creates parent directories if needed.',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' },
      },
      required: ['file_path', 'content'],
    };
  }

  async execute(input) {
    const { file_path, content } = input;
    try {
      await mkdir(dirname(file_path), { recursive: true });
      await writeFile(file_path, content, 'utf-8');
      const lines = content.split('\n').length;
      return { content: `Wrote ${lines} lines to ${file_path}` };
    } catch (err) {
      return { content: `Error writing ${file_path}: ${err.message}`, isError: true };
    }
  }
}
