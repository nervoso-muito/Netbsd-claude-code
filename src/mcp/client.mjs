import { StdioTransport } from './transport.mjs';
import { randomUUID } from 'node:crypto';

/**
 * MCP client — JSON-RPC 2.0 over stdio.
 * Connects to an MCP server, discovers tools, and executes them.
 */
export class McpClient {
  #transport;
  #pending = new Map();
  #serverInfo = null;
  #tools = [];

  constructor(command, args = [], env = {}) {
    this.#transport = new StdioTransport(command, args, env);
  }

  async connect() {
    this.#transport.on('message', (msg) => this.#handleMessage(msg));
    this.#transport.start();

    // Initialize
    const initResult = await this.#request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ncc', version: '0.1.0' },
    });

    this.#serverInfo = initResult;

    // Send initialized notification
    this.#notify('notifications/initialized', {});

    // Discover tools
    const toolsResult = await this.#request('tools/list', {});
    this.#tools = toolsResult.tools ?? [];

    return this;
  }

  getTools() {
    return this.#tools;
  }

  getToolDefs() {
    return this.#tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  async callTool(name, args) {
    const result = await this.#request('tools/call', { name, arguments: args });
    return result;
  }

  close() {
    this.#transport.close();
  }

  #request(method, params) {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      this.#pending.set(id, { resolve, reject });
      this.#transport.send({ jsonrpc: '2.0', id, method, params });

      // Timeout after 30s
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  #notify(method, params) {
    this.#transport.send({ jsonrpc: '2.0', method, params });
  }

  #handleMessage(msg) {
    if (msg.id && this.#pending.has(msg.id)) {
      const { resolve, reject } = this.#pending.get(msg.id);
      this.#pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message ?? 'MCP error'));
      } else {
        resolve(msg.result);
      }
    }
  }
}
