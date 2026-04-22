import { BaseTool } from './base-tool.mjs';
import { readFile, writeFile } from 'node:fs/promises';

export default class NotebookEditTool extends BaseTool {
  get name() { return 'NotebookEdit'; }

  get schema() {
    return {
      description: 'Edit a Jupyter notebook cell.',
      properties: {
        notebook_path: { type: 'string', description: 'Absolute path to the .ipynb file' },
        cell_number: { type: 'number', description: 'Cell index (0-based)' },
        new_source: { type: 'string', description: 'New cell source content' },
        cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type' },
        edit_mode: { type: 'string', enum: ['replace', 'insert', 'delete'], description: 'Edit mode' },
      },
      required: ['notebook_path', 'new_source'],
    };
  }

  async execute(input) {
    const { notebook_path, cell_number = 0, new_source, cell_type, edit_mode = 'replace' } = input;

    try {
      const text = await readFile(notebook_path, 'utf-8');
      const nb = JSON.parse(text);

      if (!nb.cells || !Array.isArray(nb.cells)) {
        return { content: 'Error: Invalid notebook format', isError: true };
      }

      const source = new_source.split('\n').map((l, i, a) => i < a.length - 1 ? l + '\n' : l);

      if (edit_mode === 'insert') {
        const newCell = {
          cell_type: cell_type ?? 'code',
          source,
          metadata: {},
          ...(cell_type !== 'markdown' ? { outputs: [], execution_count: null } : {}),
        };
        nb.cells.splice(cell_number, 0, newCell);
      } else if (edit_mode === 'delete') {
        if (cell_number >= nb.cells.length) {
          return { content: `Error: Cell ${cell_number} does not exist`, isError: true };
        }
        nb.cells.splice(cell_number, 1);
      } else {
        if (cell_number >= nb.cells.length) {
          return { content: `Error: Cell ${cell_number} does not exist`, isError: true };
        }
        nb.cells[cell_number].source = source;
        if (cell_type) nb.cells[cell_number].cell_type = cell_type;
      }

      await writeFile(notebook_path, JSON.stringify(nb, null, 1), 'utf-8');
      return { content: `Notebook ${edit_mode}d cell ${cell_number} in ${notebook_path}` };
    } catch (err) {
      return { content: `Error: ${err.message}`, isError: true };
    }
  }
}
