import { BaseTool } from './base-tool.mjs';
import { readFile, writeFile } from 'node:fs/promises';

export default class EditTool extends BaseTool {
  get name() { return 'Edit'; }

  get schema() {
    return {
      description: 'Perform exact string replacement in a file.',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'The exact string to find and replace' },
        new_string: { type: 'string', description: 'The replacement string' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    };
  }

  async execute(input) {
    const { file_path, old_string, new_string, replace_all = false } = input;

    try {
      const content = await readFile(file_path, 'utf-8');

      if (!content.includes(old_string)) {
        return { content: `Error: old_string not found in ${file_path}`, isError: true };
      }

      if (!replace_all) {
        // Check uniqueness
        const count = content.split(old_string).length - 1;
        if (count > 1) {
          return {
            content: `Error: old_string appears ${count} times in ${file_path}. Use replace_all: true or provide more context.`,
            isError: true,
          };
        }
      }

      const newContent = replace_all
        ? content.replaceAll(old_string, new_string)
        : content.replace(old_string, new_string);

      await writeFile(file_path, newContent, 'utf-8');
      return { content: `Edited ${file_path}` };
    } catch (err) {
      return { content: `Error editing ${file_path}: ${err.message}`, isError: true };
    }
  }
}
