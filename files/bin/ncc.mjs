#!/usr/bin/env node

import { loadConfig } from '../src/core/config.mjs';
import { createClient } from '../src/core/client.mjs';
import { login, loadCredentials, getAuthMethod } from '../src/core/auth.mjs';
import { createConversation, addUserMessage, addAssistantMessage, addToolResult } from '../src/core/conversation.mjs';
import { buildSystemPrompt } from '../src/core/memory.mjs';
import { createDefaultRegistry } from '../src/tools/registry.mjs';
import { createPermissionManager } from '../src/permissions/manager.mjs';
import { askPermission } from '../src/ui/permission-dialog.mjs';
import { createSessionManager } from '../src/core/session.mjs';
import { createRenderer } from '../src/ui/renderer.mjs';
import { createPrompt } from '../src/ui/prompt.mjs';
import { SkillLoader } from '../src/skills/loader.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
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
    console.log('  login           Authenticate via OAuth or API key');
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

  const initialPrompt = positional.length > 0 ? positional.join(' ') : null;

  // Load config
  const config = await loadConfig();
  let effectiveConfig = modelOverride
    ? Object.freeze({ ...config, model: modelOverride })
    : config;

  // Check auth
  if (!effectiveConfig.apiKey) {
    const creds = await loadCredentials();
    const method = getAuthMethod(creds);
    if (!method) {
      console.error(chalk.red('Not authenticated. Run: ncc login'));
      console.error(chalk.dim('Or set ANTHROPIC_API_KEY for API key auth.'));
      process.exit(1);
    }
  }

  // Discover skills
  const skillLoader = new SkillLoader();
  await skillLoader.discover(effectiveConfig.claudeDir, effectiveConfig.projectDir);

  // Build system prompt (include skill descriptions)
  let systemPrompt = await buildSystemPrompt(effectiveConfig);

  // Append skill list to system prompt
  const allSkills = skillLoader.listAllSkills();
  const invocableSkills = allSkills.filter(s => s.meta['disable-model-invocation'] !== true);
  if (invocableSkills.length > 0) {
    const skillList = invocableSkills.map(s => {
      const desc = s.meta.description || '';
      return `- /${s.name}${desc ? ': ' + desc : ''}`;
    }).join('\n');
    systemPrompt += `\n\n# Available Skills\n\nThe following skills can be invoked with the Skill tool:\n${skillList}`;
  }

  const userSkills = skillLoader.listUserSkills();
  if (userSkills.length > 0) {
    const skillSection = userSkills.map(s => {
      const hint = s.argumentHint ? ` ${s.argumentHint}` : '';
      return `- /${s.name}${hint}${s.description ? ' — ' + s.description : ''}`;
    }).join('\n');
    systemPrompt += `\n\nUser-invocable skills:\n${skillSection}`;
  }

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
  let tokenUsage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };

  console.error(chalk.dim(`ncc ${VERSION} • ${effectiveConfig.model}`));
  console.error(chalk.dim('Type /help for commands, /quit to exit\n'));

  // One-shot mode
  if (printMode && initialPrompt) {
    conversation = addUserMessage(conversation, initialPrompt);
    const ctx = { system, tools, client, registry, renderer, effectiveConfig, permissions, tokenUsage };
    await runTurn(conversation, ctx);
    process.exit(0);
  }

  const ctx = { system, tools, client, registry, renderer, effectiveConfig, permissions, tokenUsage };
  let sessionId = null;

  // REPL with initial prompt
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
        console.error(chalk.dim(`Resume with: ncc then /resume ${sessionId.slice(0, 8)}`));
      }
      console.error(chalk.dim('Goodbye.'));
      break;
    }
    if (input === '') continue;

    // --- Built-in commands ---

    if (input === '/help') {
      printHelp(userSkills);
      continue;
    }

    if (input === '/clear') {
      conversation = createConversation();
      sessionId = null;
      tokenUsage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      ctx.tokenUsage = tokenUsage;
      console.error(chalk.dim('Conversation cleared.'));
      continue;
    }

    if (input === '/cost') {
      const t = ctx.tokenUsage;
      console.error(chalk.dim(`  Input:  ${t.input.toLocaleString()} tokens`));
      console.error(chalk.dim(`  Output: ${t.output.toLocaleString()} tokens`));
      if (t.cacheRead) console.error(chalk.dim(`  Cache read:   ${t.cacheRead.toLocaleString()} tokens`));
      if (t.cacheCreate) console.error(chalk.dim(`  Cache create: ${t.cacheCreate.toLocaleString()} tokens`));
      console.error(chalk.dim(`  Messages: ${conversation.length}`));
      continue;
    }

    if (input === '/context') {
      console.error(chalk.dim(`  Model: ${effectiveConfig.model}`));
      console.error(chalk.dim(`  Messages: ${conversation.length}`));
      console.error(chalk.dim(`  Input tokens used: ${ctx.tokenUsage.input.toLocaleString()}`));
      console.error(chalk.dim(`  Thinking: ${effectiveConfig.thinkingEnabled ? 'enabled' : 'disabled'} (budget: ${effectiveConfig.maxThinkingTokens})`));
      continue;
    }

    if (input.startsWith('/compact')) {
      const instructions = input.slice('/compact'.length).trim();
      const compactPrompt = instructions
        ? `Summarize our conversation so far, focusing on: ${instructions}. Be concise but preserve key decisions, code changes, and context needed to continue.`
        : 'Summarize our conversation so far. Be concise but preserve key decisions, code changes, file paths, and context needed to continue working.';
      conversation = addUserMessage(conversation, compactPrompt);
      conversation = await runTurn(conversation, ctx);
      // Replace conversation with just the summary
      const lastMsg = conversation[conversation.length - 1];
      if (lastMsg?.role === 'assistant') {
        const summaryText = lastMsg.content?.map(b => b.text || '').join('') || '';
        conversation = createConversation();
        conversation = addUserMessage(conversation, 'Here is a summary of our prior conversation:\n\n' + summaryText);
        conversation = addAssistantMessage(conversation, [{ type: 'text', text: 'Understood. I have the context from our previous conversation. How can I help?' }]);
        console.error(chalk.dim('Conversation compacted.'));
      }
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

    if (input.startsWith('/model')) {
      const newModel = input.slice('/model'.length).trim();
      if (!newModel) {
        console.error(chalk.dim(`Current model: ${effectiveConfig.model}`));
        console.error(chalk.dim('Available: claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-7'));
      } else {
        effectiveConfig = Object.freeze({ ...effectiveConfig, model: newModel });
        ctx.effectiveConfig = effectiveConfig;
        console.error(chalk.dim(`Model set to: ${newModel}`));
      }
      continue;
    }

    if (input === '/init') {
      const claudeMdPath = join(effectiveConfig.projectDir, 'CLAUDE.md');
      try {
        const initPrompt = `Look at the project in ${effectiveConfig.projectDir} and create a CLAUDE.md file with project-specific instructions. Include: project description, tech stack, build/test commands, code conventions, and any important patterns. Write the file to ${claudeMdPath}.`;
        conversation = addUserMessage(conversation, initPrompt);
        conversation = await runTurn(conversation, ctx);
      } catch {
        console.error(chalk.red('Failed to initialize CLAUDE.md'));
      }
      continue;
    }

    if (input === '/skills') {
      const skills = skillLoader.listUserSkills();
      if (skills.length === 0) {
        console.error(chalk.dim('No custom skills found.'));
        console.error(chalk.dim('Add skills to ~/.claude/skills/<name>/SKILL.md'));
        console.error(chalk.dim('Or .claude/skills/<name>/SKILL.md (project-level)'));
      } else {
        console.error(chalk.dim('Available skills:'));
        for (const s of skills) {
          const hint = s.argumentHint ? ` ${s.argumentHint}` : '';
          console.error(chalk.dim(`  /${s.name}${hint}${s.description ? ' — ' + s.description : ''}`));
        }
      }
      continue;
    }

    // --- Skill dispatch ---
    if (input.startsWith('/') && !input.startsWith('//')) {
      const spaceIdx = input.indexOf(' ');
      const cmdName = (spaceIdx > 0 ? input.slice(1, spaceIdx) : input.slice(1)).toLowerCase();
      const cmdArgs = spaceIdx > 0 ? input.slice(spaceIdx + 1).trim() : '';

      const rendered = skillLoader.renderSkill(cmdName, cmdArgs);
      if (rendered) {
        console.error(chalk.dim(`Running skill: ${rendered.name}`));
        conversation = addUserMessage(conversation, rendered.content);
        conversation = await runTurn(conversation, ctx);
        continue;
      }

      // Unknown command
      console.error(chalk.dim(`Unknown command: /${cmdName}. Type /help for available commands.`));
      continue;
    }

    // Regular message
    conversation = addUserMessage(conversation, input);
    conversation = await runTurn(conversation, ctx);
  }

  prompt.close();
}

function printHelp(userSkills) {
  console.error(chalk.bold('\n  Built-in Commands:\n'));
  console.error(chalk.dim('  /help              Show this help'));
  console.error(chalk.dim('  /quit, /exit       Save session and exit'));
  console.error(chalk.dim('  /clear             Clear conversation'));
  console.error(chalk.dim('  /compact [focus]   Compress conversation context'));
  console.error(chalk.dim('  /cost              Show token usage'));
  console.error(chalk.dim('  /context           Show context info'));
  console.error(chalk.dim('  /model [name]      Show or switch model'));
  console.error(chalk.dim('  /mode [ask|plan|auto]  Show or set permission mode'));
  console.error(chalk.dim('  /save              Save current session'));
  console.error(chalk.dim('  /resume [id]       List or resume sessions'));
  console.error(chalk.dim('  /init              Generate CLAUDE.md for project'));
  console.error(chalk.dim('  /skills            List available skills'));

  if (userSkills.length > 0) {
    console.error(chalk.bold('\n  Custom Skills:\n'));
    for (const s of userSkills) {
      const hint = s.argumentHint ? ` ${s.argumentHint}` : '';
      console.error(chalk.dim(`  /${s.name}${hint}${s.description ? ' — ' + s.description : ''}`));
    }
  }
  console.error('');
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
        const msg = event.message;
        renderer.newLine();

        // Track token usage
        if (msg.usage) {
          ctx.tokenUsage.input += msg.usage.input_tokens ?? 0;
          ctx.tokenUsage.output += msg.usage.output_tokens ?? 0;
          ctx.tokenUsage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
          ctx.tokenUsage.cacheCreate += msg.usage.cache_creation_input_tokens ?? 0;
        }

        conversation = addAssistantMessage(conversation, contentBlocks);

        // Handle tool use
        const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');
        if (toolBlocks.length > 0 && msg.stop_reason === 'tool_use') {
          for (const tool of toolBlocks) {
            renderer.renderToolUse(tool.name, tool.input);

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
