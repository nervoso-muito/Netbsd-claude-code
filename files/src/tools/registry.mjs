/**
 * Tool registry — dispatch hub for all tools.
 */
export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    this.#tools.set(tool.name, tool);
  }

  get(name) {
    return this.#tools.get(name) ?? null;
  }

  getAll() {
    return [...this.#tools.values()];
  }

  getToolDefs() {
    return this.getAll().map(t => t.toToolDef());
  }

  async execute(name, input, context) {
    const tool = this.get(name);
    if (!tool) {
      return { content: `Unknown tool: ${name}`, isError: true };
    }
    try {
      return await tool.execute(input, context);
    } catch (err) {
      return { content: `Tool error: ${err.message}`, isError: true };
    }
  }
}

// Create default registry with all built-in tools
export async function createDefaultRegistry() {
  const registry = new ToolRegistry();

  const modules = await Promise.all([
    import('./read.mjs'),
    import('./write.mjs'),
    import('./edit.mjs'),
    import('./bash.mjs'),
    import('./glob.mjs'),
    import('./grep.mjs'),
    import('./web-fetch.mjs'),
    import('./web-search.mjs'),
    import('./todo.mjs'),
    import('./agent.mjs'),
    import('./notebook-edit.mjs'),
    import('./skill.mjs'),
  ]);

  for (const mod of modules) {
    if (mod.default) {
      const instance = typeof mod.default === 'function' ? new mod.default() : mod.default;
      registry.register(instance);
    }
    // Register additional named exports (e.g. todoRead from todo.mjs)
    if (mod.todoRead) registry.register(mod.todoRead);
    if (mod.todoWrite) registry.register(mod.todoWrite);
  }

  return registry;
}
