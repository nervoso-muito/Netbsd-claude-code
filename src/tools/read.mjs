import { BaseTool } from './base-tool.mjs';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

export default class ReadTool extends BaseTool {
  get name() { return 'Read'; }

  get schema() {
    return {
      description: 'Read a file from the filesystem. Returns file contents with line numbers.',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read' },
        offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
        limit: { type: 'number', description: 'Number of lines to read' },
      },
      required: ['file_path'],
    };
  }

  async execute(input, context) {
    const { file_path, offset, limit } = input;

    try {
      const info = await stat(file_path);
      if (info.isDirectory()) {
        return { content: `Error: ${file_path} is a directory. Use Bash with ls to list directory contents.`, isError: true };
      }

      // Check for binary/image files
      const ext = extname(file_path).toLowerCase();
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'];
      if (imageExts.includes(ext)) {
        const data = await readFile(file_path);
        const base64 = data.toString('base64');
        const mimeType = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}`;
        return {
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          ],
        };
      }

      const text = await readFile(file_path, 'utf-8');
      const lines = text.split('\n');

      const startLine = (offset ?? 1) - 1;
      const endLine = limit ? startLine + limit : lines.length;
      const selected = lines.slice(startLine, endLine);

      const numbered = selected.map((line, i) => {
        const lineNum = startLine + i + 1;
        const truncated = line.length > 2000 ? line.slice(0, 2000) + '… (truncated)' : line;
        return `${String(lineNum).padStart(6)}\t${truncated}`;
      });

      return { content: numbered.join('\n') };
    } catch (err) {
      return { content: `Error reading ${file_path}: ${err.message}`, isError: true };
    }
  }
}
