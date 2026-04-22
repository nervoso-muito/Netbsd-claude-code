NCC (NetBSD Claude Code) is a native Node.js CLI for interacting with
Anthropic's Claude AI. It is a from-scratch rewrite designed to run
natively on NetBSD without Linux compatibility layers.

Features:
- Streaming chat with Claude (Sonnet, Opus, Haiku)
- Built-in tools: file read/write/edit, bash, glob, grep, web fetch
- Permission system (ask/plan/auto modes)
- Session save/load/resume
- MCP server support
- Hook system (pre/post tool use)
- CLAUDE.md and auto-memory support


I built it in 2 days (weekend) using an old claude-code 2.1.66 as bootstrap with the repository blocked from update by 
using chflags -R schg /usr/pkg/lib/node-modules/@anthropic....to fully inhibited update

this is a pkgsrc structure to be build from and adjust to your needs... of course if Anthropic changes the API,you must 
use this as a bootstrap to build another

The executable is in /usr/pkg/bin/ncc  and ncc --help shows the basic use 
at first you must login...  so ncc login will ask for either API_KEY of oauth... in your claude.ai brower session

Be nice and give me credits
