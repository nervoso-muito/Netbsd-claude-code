import { BaseTool } from './base-tool.mjs';

export default class WebSearchTool extends BaseTool {
  get name() { return 'WebSearch'; }

  get schema() {
    return {
      description: 'Search the web. Returns search results with titles, URLs, and snippets.',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    };
  }

  async execute(input) {
    // Web search requires a search API. For now, return a note.
    // Could integrate with SearXNG, Brave, or similar.
    return {
      content: `Web search for "${input.query}" is not yet configured. Set NCC_SEARCH_API_URL in environment to enable.`,
      isError: true,
    };
  }
}
