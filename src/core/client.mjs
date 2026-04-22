import Anthropic from '@anthropic-ai/sdk';
import { getAccessToken } from './auth.mjs';

const NCC_VERSION = '0.1.0';
const OAUTH_BETA = 'oauth-2025-04-20';

/**
 * Create an Anthropic client.
 * Auth priority: ANTHROPIC_API_KEY > OAuth token (via SDK authToken).
 */
export async function createClient(config) {
  const useOAuth = !config.apiKey;
  let currentToken = null;

  if (useOAuth) {
    currentToken = await getAccessToken();
    if (!currentToken) {
      throw new Error('Not authenticated. Run: ncc login (or set ANTHROPIC_API_KEY)');
    }
  }

  function buildClient() {
    if (useOAuth) {
      return new Anthropic({
        apiKey: null,
        authToken: currentToken,
        baseURL: config.apiBaseUrl,
        defaultHeaders: {
          'x-app': 'cli',
          'User-Agent': `ncc/${NCC_VERSION} (external, cli)`,
          'anthropic-beta': OAUTH_BETA,
        },
      });
    } else {
      return new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.apiBaseUrl,
      });
    }
  }

  let anthropic = buildClient();

  return { anthropic, sendMessage, countTokens, refreshAuth };

  async function refreshAuth() {
    if (!useOAuth) return;
    const token = await getAccessToken();
    if (token && token !== currentToken) {
      currentToken = token;
      anthropic = buildClient();
    }
  }

  async function* sendMessage(messages, { system, tools, maxTokens, abortSignal } = {}) {
    await refreshAuth();

    const params = {
      model: config.model,
      max_tokens: maxTokens ?? config.maxTokens,
      messages,
    };

    if (system) params.system = system;
    if (tools?.length) params.tools = tools;

    if (config.thinkingEnabled) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: config.maxThinkingTokens,
      };
      params.temperature = 1;
    } else {
      params.temperature = config.temperature;
    }

    const stream = anthropic.messages.stream(params, { signal: abortSignal });

    for await (const event of stream) {
      yield event;
    }

    const finalMessage = await stream.finalMessage();
    yield { type: 'message_complete', message: finalMessage };
  }

  async function countTokens(messages, { system, tools } = {}) {
    await refreshAuth();
    const params = { model: config.model, messages };
    if (system) params.system = system;
    if (tools?.length) params.tools = tools;
    const result = await anthropic.messages.countTokens(params);
    return result.input_tokens;
  }
}
