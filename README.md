# AgentOS

**Enterprise-grade AI agent orchestration cockpit** — cross-platform (macOS, Windows, Linux) desktop app for running multiple AI agents in parallel on your codebase. Real tool use, MCP protocol, split panes, team collab, cost tracking.

## Features

| Feature             | AgentOS                            |
| ------------------- | ---------------------------------- |
| **Cross-platform**  | ✅ macOS + Windows + Linux          |
| **MCP protocol**    | ✅ stdio / SSE / WebSocket          |
| **Real tool use**   | ✅ 9 built-in tools + all MCP tools |
| **Split panes**     | ✅ 1/2/4-pane layouts               |
| **Agent pipelines** | ✅ Topological execution engine     |
| **Team collab**     | ✅ Socket.io real-time presence     |
| **Cost dashboard**  | ✅ Per-call tracking + charts       |
| **Templates**       | ✅ 8 built-in + marketplace         |
| **Global search**   | ✅ Messages + files + agents        |
| **Shortcuts**       | ✅ 30+ keyboard shortcuts           |
| **Self-hosted**     | ✅ Docker Compose                   |
| **Air-gapped**      | ✅                                  |
| **SSO / SAML**      | ✅                                  |
| **Audit logs**      | ✅                                  |
| **Open source**     | ✅ MIT                              |

## Quick Start

```bash
git clone https://github.com/anandpilania/agentos.git
cd agentos
npm install
npm run dev
```

## Build

```bash
npm run dist:mac    # macOS .dmg (Intel + Apple Silicon)
npm run dist:win    # Windows .exe installer
npm run dist:linux  # Linux .AppImage + .deb + .rpm
npm run dist:all    # All platforms
```

## Self-Hosted

```bash
docker-compose up -d   # http://localhost:3000
```

## Key Architecture

- **Main process**: AgentManager (tool loops), MCPManager (protocol), ToolEngine (bash/files/git), PipelineManager (agent-to-agent), CollabManager (Socket.io), SessionManager (persistence)
- **Renderer**: SplitPaneLayout (4 layouts), ChatPanel (tool call UI), MCPPanel, CostPanel, TemplatesPanel, GlobalSearch, KeyboardShortcuts
- **Shared**: 60+ TypeScript types, IPC channel constants

## Agent Tool Use Loop

Agents don't just chat — they act. For Anthropic/OpenAI:
1. Send prompt → stream response
2. Provider returns tool calls → execute in ToolEngine or MCP server
3. Feed results back → repeat until `end_turn`

## License

MIT
