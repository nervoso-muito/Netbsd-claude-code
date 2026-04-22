import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

/**
 * stdio transport for MCP — spawns a subprocess and communicates via JSON-RPC 2.0.
 */
export class StdioTransport extends EventEmitter {
  #proc = null;
  #buffer = '';

  constructor(command, args = [], env = {}) {
    super();
    this._command = command;
    this._args = args;
    this._env = env;
  }

  start() {
    this.#proc = spawn(this._command, this._args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this._env },
    });

    this.#proc.stdout.on('data', (chunk) => {
      this.#buffer += chunk.toString();
      this.#processBuffer();
    });

    this.#proc.stderr.on('data', (chunk) => {
      this.emit('stderr', chunk.toString());
    });

    this.#proc.on('close', (code) => {
      this.emit('close', code);
    });

    this.#proc.on('error', (err) => {
      this.emit('error', err);
    });
  }

  send(message) {
    if (!this.#proc?.stdin?.writable) {
      throw new Error('Transport not connected');
    }
    const json = JSON.stringify(message);
    this.#proc.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  close() {
    if (this.#proc) {
      this.#proc.kill();
      this.#proc = null;
    }
  }

  #processBuffer() {
    while (true) {
      const headerEnd = this.#buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.#buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.#buffer = this.#buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const contentStart = headerEnd + 4;

      if (this.#buffer.length < contentStart + contentLength) break;

      const content = this.#buffer.slice(contentStart, contentStart + contentLength);
      this.#buffer = this.#buffer.slice(contentStart + contentLength);

      try {
        const message = JSON.parse(content);
        this.emit('message', message);
      } catch (err) {
        this.emit('error', new Error(`Invalid JSON: ${err.message}`));
      }
    }
  }
}
