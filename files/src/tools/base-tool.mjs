/**
 * Base tool interface. All tools extend this.
 */
export class BaseTool {
  /** @returns {string} Tool name as sent to the API */
  get name() { throw new Error('Subclass must implement name'); }

  /** @returns {object} JSON Schema for the tool */
  get schema() { throw new Error('Subclass must implement schema'); }

  /**
   * Execute the tool.
   * @param {object} input - Tool input parameters
   * @param {object} context - Execution context { config, cwd, abortSignal }
   * @returns {Promise<{ content: string, isError?: boolean }>}
   */
  async execute(input, context) {
    throw new Error('Subclass must implement execute');
  }

  /** Build the tool definition for the API */
  toToolDef() {
    return {
      name: this.name,
      description: this.schema.description,
      input_schema: {
        type: 'object',
        properties: this.schema.properties ?? {},
        required: this.schema.required ?? [],
      },
    };
  }
}
