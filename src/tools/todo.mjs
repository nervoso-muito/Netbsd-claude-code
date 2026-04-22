import { BaseTool } from './base-tool.mjs';

// In-memory todo list for the session
let todos = [];
let nextId = 1;

class TodoWriteTool extends BaseTool {
  get name() { return 'TodoWrite'; }

  get schema() {
    return {
      description: 'Create or update tasks in the session todo list.',
      properties: {
        todos: {
          type: 'array',
          description: 'Array of todo items',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subject: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
          },
        },
      },
      required: ['todos'],
    };
  }

  async execute(input) {
    for (const item of input.todos) {
      const existing = todos.find(t => t.id === item.id);
      if (existing) {
        Object.assign(existing, item);
      } else {
        todos.push({ id: item.id ?? String(nextId++), ...item });
      }
    }
    return { content: `Updated ${input.todos.length} todo(s). Total: ${todos.length}` };
  }
}

class TodoReadTool extends BaseTool {
  get name() { return 'TodoRead'; }

  get schema() {
    return {
      description: 'Read the current session todo list.',
      properties: {},
    };
  }

  async execute() {
    if (todos.length === 0) return { content: 'No todos.' };
    const lines = todos.map(t => `[${t.status ?? 'pending'}] #${t.id}: ${t.subject ?? ''}`);
    return { content: lines.join('\n') };
  }
}

export const todoWrite = new TodoWriteTool();
export const todoRead = new TodoReadTool();
export default todoWrite;
