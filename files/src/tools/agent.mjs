import { BaseTool } from './base-tool.mjs';

export default class AgentTool extends BaseTool {
  get name() { return 'Agent'; }

  get schema() {
    return {
      description: 'Launch a sub-agent to handle a complex task autonomously.',
      properties: {
        prompt: { type: 'string', description: 'Task for the agent' },
        description: { type: 'string', description: 'Short description (3-5 words)' },
        subagent_type: { type: 'string', description: 'Agent type' },
        model: { type: 'string', description: 'Model override' },
      },
      required: ['prompt', 'description', 'subagent_type'],
    };
  }

  async execute(input) {
    // Sub-agent spawning will be implemented in Phase 5
    // For now, return a placeholder
    return {
      content: `Sub-agent "${input.description}" (${input.subagent_type}): Sub-agent execution not yet implemented.`,
      isError: true,
    };
  }
}
