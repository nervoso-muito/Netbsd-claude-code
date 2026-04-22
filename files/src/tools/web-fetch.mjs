import { BaseTool } from './base-tool.mjs';

export default class WebFetchTool extends BaseTool {
  get name() { return 'WebFetch'; }

  get schema() {
    return {
      description: 'Fetch content from a URL.',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        prompt: { type: 'string', description: 'What to extract from the content' },
      },
      required: ['url', 'prompt'],
    };
  }

  async execute(input) {
    const { url, prompt } = input;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ncc/0.1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        return { content: `HTTP ${resp.status}: ${resp.statusText}`, isError: true };
      }

      let text = await resp.text();
      // Basic HTML to text — strip tags
      text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      text = text.replace(/<[^>]+>/g, ' ');
      text = text.replace(/\s+/g, ' ').trim();

      // Truncate
      if (text.length > 50000) {
        text = text.slice(0, 50000) + '\n... (truncated)';
      }

      return { content: `Fetched ${url} (${text.length} chars)\nPrompt: ${prompt}\n\n${text}` };
    } catch (err) {
      return { content: `Fetch error: ${err.message}`, isError: true };
    }
  }
}
