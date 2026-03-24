# AgentOS Changelog

## v2.0.0 — Full Overhaul (Production-Ready)

### 🚀 New Features

#### MCP (Model Context Protocol) — Full Implementation
- Complete MCP client supporting stdio, SSE, and WebSocket transports
- JSON-RPC 2.0 message framing with timeout and retry handling
- Auto-discovery of tools and resources on connection
- One-click quick-add presets: Filesystem, GitHub, Postgres, Brave Search
- Per-agent MCP server assignment
- Live connection status with tool list expansion
- Graceful reconnect and error reporting
- `MCPManager` is a fully async EventEmitter with proper lifecycle management

#### Agent Tool Use — Real Execution
- Agents now actually edit files, run bash, search code, and commit git
- `ToolEngine` with 9 built-in tools: `read_file`, `write_file`, `list_files`, `bash`, `search_code`, `grep`, `git_status`, `git_diff`, `git_commit`
- Path traversal blocking (agents sandboxed to workspace directory)
- Dangerous command blocklist for bash execution
- Tool call streaming — UI shows live tool calls as they happen with collapsible input/output
- Tool calls tracked in `AgentStats.toolCalls` counter

#### Split-Pane Layout — Multi-Agent Cockpit
- 4 layout presets: Single, 2 Horizontal, 2 Vertical, 4-Pane Quad
- Each pane independently selects agent + panel type
- Per-pane panel switcher (chat, terminal, diff, files, graph)
- Per-pane agent picker with status indicator
- Resizable dividers between panes
- Active pane highlighted with void accent border
- Layout saved to session and persisted across restarts

#### Session Persistence & Restore
- `SessionManager` stores sessions in SQLite with full pane config
- Sessions listed in sidebar under "Sessions" tab
- Each session remembers: agents assigned, pane layout, last active timestamp
- Switching sessions restores exact pane configuration
- Sessions updated on every interaction (`touch`)
- Session-scoped agent-to-agent pipeline association

#### Real-Time Team Collaboration (Socket.io)
- `CollabManager` WebSocket server with room-based session isolation
- User presence: join/leave events, avatar colors, heartbeat pruning (60s TTL)
- Live presence bar in TitleBar showing all active users with color-coded avatars
- Cursor/selection broadcast between collaborators
- Agent update events forwarded to all session members
- Generic `CollabEvent` bus for extensibility

#### Agent-to-Agent Pipelines
- `PipelineManager` with topological sort execution engine
- Node types: `input`, `agent`, `output`, `condition`, `merge`, `transform`, `parallel`
- Conditional routing via JavaScript expressions
- Transform nodes for data manipulation between agents
- Error edges: pipeline continues on agent failure if error edge is wired
- Pipeline runs stored in SQLite with full result history
- Pipeline status events emitted via EventEmitter
- Visual pipeline editor reuses GraphPanel (ReactFlow)

#### Agent Templates & Marketplace
- 8 production-ready built-in templates:
  - Full-Stack Engineer (TypeScript, React, Node.js)
  - Code Reviewer (security, bugs, performance)
  - Test Writer (Jest, Vitest, Playwright)
  - DevOps Engineer (Docker, K8s, Terraform, GitHub Actions)
  - Data Analyst (Python, SQL, pandas)
  - Documentation Writer (README, API docs, comments)
  - Refactoring Specialist (SOLID principles, clean code)
  - Security Auditor (OWASP Top 10, dependency scanning)
- Templates seeded automatically to SQLite on first run
- Template marketplace panel with category filtering and search
- Install count tracking
- One-click agent creation from template
- Template search with name/description/tag matching

#### Cost Tracking Dashboard
- Every AI API call records: provider, model, tokens in/out, cost (USD)
- Cost entries stored in SQLite `cost_entries` table
- Dashboard shows: total cost, by-model breakdown, by-agent breakdown, daily bar chart
- Time range filter: 1 day, 7 days, 30 days, all time
- Accurate cost per model based on published pricing (auto-fallback for unknown models)
- Cost shown in agent stats panel (right panel)
- Token counts shown in chat footer per conversation

#### Global Search
- Searches messages, agents, workspaces, templates in one keystroke (⌘/)
- Debounced 200ms with loading indicator
- Grouped results by type with icons
- Recent search history (localStorage, last 8 queries)
- Quick actions when no query: new agent, MCP panel, cost, templates
- Falls back to local in-memory search if IPC unavailable
- Results navigate directly to the relevant panel/agent

#### Full Keyboard Shortcut System
- 30+ shortcuts covering navigation, panels, layouts, agents
- Two implementations: `KeyboardShortcuts.tsx` (component) and `useKeyboardShortcuts.ts` (hook)
- Shortcuts modal with all shortcuts categorized and displayed
- macOS / Windows/Linux aware (⌘ vs Ctrl)
- Respects input focus — shortcuts don't fire inside text fields
- Alt+1–9 for instant agent selection by position
- ⌘+Shift+1–4 for layout switching

### ⚡ Improvements

#### AgentManager v2
- **Real tool use loop** — Anthropic and OpenAI providers execute tool calls in a loop until `end_turn`
- **MCP tool integration** — `mcp__serverId__toolName` routing to connected MCP servers
- **p-queue** for concurrent agent limiting (configurable max concurrency)
- **p-retry** with 2 retries on API failures with logging
- **Accurate cost tracking** per message with model-specific pricing table
- `searchMessages()` for full-text search across all agent message history
- `getCostSummary()` with filters for date range and agent

#### DatabaseManager v2
- 13 tables vs 9 in v1
- New tables: `pipelines`, `mcp_servers`, `agent_templates`, `cost_entries`, `sessions` (upgraded)
- `agents` table: added `mcp_servers`, `tools`, `max_tokens`, `temperature`, `template_id` columns
- `agent_messages`: added `cost`, `model` columns
- 10 performance indexes including content search index on messages
- WAL mode + 64MB cache for high concurrency
- `NORMAL` synchronous mode for better throughput

#### UI/UX
- **TitleBar v2**: 9 panel buttons, running agent counter, error badge, presence avatars, user menu with sign out
- **Sidebar v2**: Sessions tab, Templates tab (links to panel), agent tool/provider metadata
- **RightPanel v2**: Tool call count in stats, all 7 stat cards, per-agent MCP server list
- **ChatPanel v2**: Tool call display with expand/collapse, copy button, token+cost footer
- **NewAgentModal v2**: Template picker tab, tool selector checkboxes, template preview badge
- **SettingsModal v2**: Shortcuts tab with full `ShortcutsHelp` component, real audit log display
- Zustand store persists `token`, `sidebarWidth`, `rightWidth`, `onboardingComplete`, `paneLayout` to localStorage

#### Onboarding
- 5-step guided onboarding flow: Welcome → Provider → Workspace → Template → Done
- Progress bar with animated transitions between steps
- Creates first agent automatically from selected template
- Skippable at any step

### 🔧 Infrastructure

#### Testing
- Unit test suite covering `ToolEngine`, `SessionManager`, `TemplateManager`
- Tests use real SQLite in temp directories (not mocked)
- Jest + ts-jest configuration
- Coverage thresholds: 60% branches/functions/lines

#### CI/CD
- GitHub Actions: lint → typecheck → test → build (mac/win/linux) → release
- Docker image for self-hosted server mode
- Docker Compose with Nginx reverse proxy
- Environment variable configuration for all API keys

### 🐛 Bug Fixes vs v1

| v1 Issue | v2 Fix |
|----------|--------|
| Agents could only chat, not act | Full tool use loop implemented |
| No MCP support | Complete MCP client with stdio/sse/ws |
| Single-pane layout only | 4 layout presets with per-pane agent/panel selection |
| No session persistence | Sessions saved to SQLite, restored on launch |
| No real cost tracking | Per-call cost recording with dashboard |
| Settings UI not wired | Providers actually save, audit log loads real data |
| All IPC handlers in one file | Split across domain-specific handler files |
| No input validation on IPC | Zod-ready structure, path traversal blocked |
| No retry on AI calls | p-retry with 2 retries |
| chokidar not wired | File watcher ready to integrate |
| Git collab not implemented | Socket.io CollabManager with presence |

---

## v1.0.0 — Initial Release

- Basic Electron app with React renderer
- Single-pane layout (chat only)
- Anthropic, OpenAI, Gemini, Ollama streaming chat
- Git worktree workspace management
- xterm.js terminal
- Git diff viewer
- Monaco file editor
- ReactFlow agent graph (visual only)
- SQLite database with basic schema
- Local auth (email + password)
- Settings modal (UI only, most not wired)
- electron-builder packaging for mac/win/linux
- GitHub Actions CI/CD skeleton
