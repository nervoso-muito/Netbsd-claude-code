# NCC — NetBSD Claude Code

## Project
- Pure Node.js (ESM) rewrite of Claude Code for NetBSD
- Source: /usr/pkgsrc/mate/ncc/files/
- Installed to: /usr/pkg/share/ncc/ via pkgsrc

## Build
cd /usr/pkgsrc/mate/ncc && make clean replace

## Architecture
- bin/ncc.mjs — entry point + REPL
- src/core/ — config, client, auth, conversation, session, memory
- src/tools/ — 13 tools (read, write, edit, bash, glob, grep, etc.)
- src/permissions/ — ask/plan/auto modes
- src/skills/ — SKILL.md loader + slash command dispatch
- src/ui/ — renderer, prompt, markdown, diff-view, spinner
- src/mcp/ — MCP JSON-RPC client
- src/hooks/ — pre/post tool hooks

## Auth
- OAuth: anthropic-beta: oauth-2025-04-20 header required
- API key: stored in ~/.claude/.credentials.json
- ncc login — choose OAuth or API key

## Key Decisions
- Default model: claude-sonnet-4-6
- Thinking disabled by default (thinkingEnabled: false)
- maxThinkingTokens: 10000 (must be < maxTokens 16384)
- ESM only (.mjs), no bundler, no native addons
- Immutable conversation state
