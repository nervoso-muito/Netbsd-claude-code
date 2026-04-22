#!/usr/bin/env node

import { loadConfig } from '../src/core/config.mjs';
import { createClient } from '../src/core/client.mjs';
import { login, loadCredentials } from '../src/core/auth.mjs';
import { createConversation, addUserMessage, addAssistantMessage, addToolResult } from '../src/core/conversation.mjs';
import { buildSystemPrompt } from '../src/core/memory.mjs';
import { createDefaultRegistry } from '../src/tools/registry.mjs';
import { createPermissionManager } from '../src/permissions/manager.mjs';
import { askPermission } from '../src/ui/permission-dialog.mjs';
import { createSessionManager } from '../src/core/session.mjs';
import { createRenderer } from '../src/ui/renderer.mjs';
import { createPrompt } from '../src/ui/prompt.mjs';
import chalk from 'chalk';

const VERSION = '0.1.0';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`ncc ${VERSION}`);
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`ncc ${VERSION} — NetBSD Claude Code`);
    console.log('Usage: ncc [options] [initial prompt]');
    console.log('Commands:');
    console.log('  login           Authenticate via OAuth (uses your claude.ai account)');
    console.log('  logout          Remove stored credentials');
    console.log('Options:');
    console.log('  -v, --version   Show version');
    console.log('  -h, --help      Show help');
    console.log('  -m, --model     Override model');
    console.log('  -p, --print     One-shot mode (no REPL)');
    process.exit(0);
  }

  // Handle login/logout commands
  if (args[0] === 'login') {
    await login();
    process.exit(0);
  }

  if (args[0] === 'logout') {
    const { unlink } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { CLAUDE_DIR } = await import('../src/core/config.mjs');
    try {
      await unlink(join(CLAUDE_DIR, '.credentials.json'));
      console.log(chalk.dim('Logged out. Credentials removed.'));
    } catch {
      console.log(chalk.dim('No credentials found.'));
    }
    process.exit(0);
  }

  // Parse options
  let modelOverride = null;
  let printMode = false;
  let initialPrompt = null;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-m' || args[i] === '--model') && args[i + 1]) {
      modelOverride = args[++i];
    } else if (args[i] === '-p' || args[i] === '--print') {
      printMode = true;
    } else if (!args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }

  if (positional.length > 0) {
    initialPrompt = positional.join(' ');
  }

  // Load config
  const config = await loadConfig();
  const effectiveConfig = modelOverride
    ? Object.freeze({ ...config, model: modelOverride })
    : config;

  // Check auth: API key or OAuth credentials
  if (!effectiveConfig.apiKey) {
    const creds = await loadCredentials();
    if (!creds) {
      console.error(chalk.red('Not authenticated. Run: ncc login'));
      console.error(chalk.dim('Or set ANTHROPIC_API_KEY for API key auth.'));
      process.exit(1);
    }
  }

  // Build system prompt
  const systemPrompt = await buildSystemPrompt(effectiveConfig);
  const system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];

  // Create client, tools, permissions, sessions, and renderer
  const client = await createClient(effectiveConfig);
  const registry = await createDefaultRegistry();
  const tools = registry.getToolDefs();
  const permissions = createPermissionManager(effectiveConfig.permissionMode ?? 'ask');
  permissions.setAskFn(askPermission);
  const sessions = createSessionManager(effectiveConfig.sessionDir);
  const renderer = createRenderer();
  const prompt = createPrompt();

  let conversation = createConversation();

  console.error(chalk.dim(`ncc ${VERSION} • ${effectiveConfig.model}`));
  console.error(chalk.dim('Type /quit to exit\n'));

  // One-shot mode
  if (printMode && initialPrompt) {
    conversation = addUserMessage(conversation, initialPrompt);
    const ctx = { system, tools, client, registry, renderer, effectiveConfig, permissions };
    await runTurn(conversation, ctx);
    process.exit(0);
  }

  const ctx = { system, tools, client, registry, renderer, effectiveConfig, permissions };
  let sessionId = null;

  // REPL
  if (initialPrompt) {
    console.error(chalk.bold.blue('> ') + initialPrompt);
    conversation = addUserMessage(conversation, initialPrompt);
    conversation = await runTurn(conversation, ctx);
  }

  while (true) {
    const input = await prompt.ask('> ');
    if (input === null || input === '/quit' || input === '/exit') {
      if (conversation.length > 0) {
        sessionId = await sessions.save(conversation, { id: sessionId, model: effectiveConfig.model });
        console.error(chalk.dim(`Session saved: ${sessionId}`));
      }
      console.error(chalk.dim('Goodbye.'));
      break;
    }
    if (input === '') continue;

    if (input === '/clear') {
      conversation = createConversation();
      sessionId = null;
      console.error(chalk.dim('Conversation cleared.'));
      continue;
    }

    if (input === '/save') {
      sessionId = await sessions.save(conversation, { id: sessionId, model: effectiveConfig.model });
      console.error(chalk.dim(`Session saved: ${sessionId}`));
      continue;
    }

    if (input.startsWith('/resume')) {
      const parts = input.split(/\s+/);
      if (parts.length < 2) {
        const list = await sessions.list();
        if (list.length === 0) {
          console.error(chalk.dim('No sessions found.'));
        } else {
          for (const s of list.slice(0, 10)) {
            console.error(chalk.dim(`  ${s.id.slice(0, 8)}  ${s.updatedAt}  ${s.messageCount} msgs  ${s.model}`));
          }
        }
        continue;
      }
      const target = parts[1];
      const full = (await sessions.list()).find(s => s.id.startsWith(target));
      if (full) {
        const session = await sessions.load(full.id);
        if (session) {
          conversation = session.conversation;
          sessionId = session.id;
          console.error(chalk.dim(`Resumed session ${sessionId.slice(0, 8)} (${conversation.length} messages)`));
        }
      } else {
        console.error(chalk.dim('Session not found.'));
      }
      continue;
    }

    if (input === '/mode') {
      console.error(chalk.dim(`Permission mode: ${permissions.getMode()}`));
      continue;
    }

    if (input.startsWith('/mode ')) {
      const newMode = input.split(/\s+/)[1];
      if (['ask', 'plan', 'auto'].includes(newMode)) {
        permissions.setMode(newMode);
        console.error(chalk.dim(`Permission mode set to: ${newMode}`));
      } else {
        console.error(chalk.dim('Valid modes: ask, plan, auto'));
      }
      continue;
    }

    conversation = addUserMessage(conversation, input);
    conversation = await runTurn(conversation, ctx);
  }

  prompt.close();
}

async function runTurn(conversation, ctx) {
  const { system, tools, client, registry, renderer, effectiveConfig } = ctx;
  try {
    const contentBlocks = [];
    let currentBlock = null;

    for await (const event of client.sendMessage(conversation, { system, tools })) {
      renderer.processEvent(event);

      if (event.type === 'content_block_start') {
        currentBlock = { ...event.content_block };
        if (currentBlock.type === 'text') currentBlock.text = '';
        if (currentBlock.type === 'thinking') currentBlock.thinking = '';
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta' && currentBlock) {
          currentBlock.text += event.delta.text;
        }
        if (event.delta.type === 'thinking_delta' && currentBlock) {
          currentBlock.thinking += event.delta.thinking;
        }
        if (event.delta.type === 'input_json_delta' && currentBlock) {
          currentBlock._inputJson = (currentBlock._inputJson ?? '') + event.delta.partial_json;
        }
      }

      if (event.type === 'content_block_stop') {
        if (currentBlock) {
          if (currentBlock.type === 'tool_use' && currentBlock._inputJson) {
            try {
              currentBlock.input = JSON.parse(currentBlock._inputJson);
            } catch {
              currentBlock.input = {};
            }
            delete currentBlock._inputJson;
          }
          contentBlocks.push(currentBlock);
          currentBlock = null;
        }
      }

      if (event.type === 'message_complete') {
        // Check stop reason
        const msg = event.message;
        renderer.newLine();

        conversation = addAssistantMessage(conversation, contentBlocks);

        // Handle tool use
        const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');
        if (toolBlocks.length > 0 && msg.stop_reason === 'tool_use') {
          for (const tool of toolBlocks) {
            renderer.renderToolUse(tool.name, tool.input);

            // Check permission
            const perm = await permissions.checkPermission(tool.name, tool.input);
            if (!perm.allowed) {
              const denied = `Permission denied for ${tool.name}`;
              conversation = addToolResult(conversation, tool.id, denied, true);
              continue;
            }

            const result = await registry.execute(tool.name, tool.input, {
              cwd: effectiveConfig.projectDir,
              config: effectiveConfig,
            });
            renderer.renderToolResult(tool.name, result.content, result.isError);
            conversation = addToolResult(
              conversation,
              tool.id,
              typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
              result.isError ?? false,
            );
          }
          // Continue the turn with tool results
          return runTurn(conversation, ctx);
        }

        return conversation;
      }
    }

    return conversation;
  } catch (error) {
    renderer.renderError(error);
    return conversation;
  }
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
