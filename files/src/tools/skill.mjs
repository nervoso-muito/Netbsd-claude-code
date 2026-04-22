import { BaseTool } from './base-tool.mjs';

export default class SkillTool extends BaseTool {
  get name() { return 'Skill'; }

  get schema() {
    return {
      description: 'Invoke a skill by name.',
      properties: {
        skill: { type: 'string', description: 'Skill name to invoke' },
        args: { type: 'string', description: 'Optional arguments' },
      },
      required: ['skill'],
    };
  }

  async execute(input) {
    // Skills are loaded into system prompt by the skill loader.
    // This tool is a placeholder for the API — the model uses it to indicate
    // it wants to invoke a skill, but the actual skill content is already
    // in the system prompt.
    return {
      content: `Skill "${input.skill}" invoked. Skill content should be in system prompt.`,
    };
  }
}
