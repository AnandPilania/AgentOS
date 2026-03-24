export type AgentStatus   = 'idle' | 'running' | 'paused' | 'done' | 'error' | 'waiting' | 'queued'
export type AIProvider    = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'custom'
export type WorkspaceType = 'git-worktree' | 'docker' | 'folder' | 'virtual'
export type DiffType      = 'added' | 'removed' | 'modified' | 'renamed' | 'deleted'
export type UserRole      = 'owner' | 'admin' | 'member' | 'viewer'
export type AuthProvider  = 'local' | 'saml' | 'oauth2' | 'github' | 'google' | 'azure'
export type ThemeMode     = 'dark' | 'light' | 'system'
export type PaneLayout    = 'single' | 'split-h' | 'split-v' | 'quad' | 'custom'
export type ToolStatus    = 'pending' | 'running' | 'done' | 'error'
export type PipelineStatus= 'idle' | 'running' | 'paused' | 'done' | 'error'
export type MCPTransport  = 'stdio' | 'sse' | 'websocket'
export type BuiltinTool   = 'read_file'|'write_file'|'list_files'|'bash'|'search_code'|'grep'|'git_status'|'git_diff'|'git_commit'|'web_search'|'http_fetch'
export type TemplateCategory = 'coding'|'testing'|'devops'|'data'|'research'|'writing'|'analysis'|'custom'

export interface Agent {
  id: string; name: string; status: AgentStatus
  provider: AIProvider; model: string
  workspaceId: string; sessionId: string; templateId?: string
  createdAt: string; updatedAt: string
  prompt?: string; tags: string[]; metadata: Record<string,unknown>
  mcpServers: string[]; tools: BuiltinTool[]
  maxTokens: number; temperature: number; stats: AgentStats
}

export interface AgentStats {
  tokensIn: number; tokensOut: number; cost: number
  duration: number; turns: number; toolCalls: number; errors: number
}

export interface AgentMessage {
  id: string; agentId: string
  role: 'user'|'assistant'|'system'|'tool'
  content: string; timestamp: string
  tokens?: number; toolCalls?: ToolCall[]; toolResult?: ToolResult
  cost?: number; model?: string
}

export interface ToolCall {
  id: string; name: string; input: Record<string,unknown>
  status: ToolStatus; startedAt: string; endedAt?: string; error?: string
}

export interface ToolResult {
  toolCallId: string; output: string; isError: boolean; duration: number
}

export interface MCPServer {
  id: string; name: string; description: string
  transport: MCPTransport; command?: string; args?: string[]
  url?: string; env?: Record<string,string>; enabled: boolean
  status: 'connected'|'disconnected'|'error'|'connecting'
  tools: MCPTool[]; resources: MCPResource[]; error?: string; createdAt: string
}

export interface MCPTool {
  name: string; description: string; inputSchema: Record<string,unknown>; serverId: string
}

export interface MCPResource {
  uri: string; name: string; description: string; mimeType?: string; serverId: string
}

export interface Workspace {
  id: string; name: string; path: string; type: WorkspaceType
  repoUrl?: string; branch?: string; baseBranch?: string
  agentIds: string[]; createdAt: string; updatedAt: string
  metadata: Record<string,unknown>; watchEnabled: boolean
}

export interface FileDiff {
  path: string; type: DiffType; additions: number; deletions: number
  chunks: DiffChunk[]; oldPath?: string
}

export interface DiffChunk {
  oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[]
}

export interface DiffLine { type: 'context'|'add'|'del'; content: string; lineNo?: number }

export interface Session {
  id: string; name: string; workspaceId: string; agentIds: string[]; userId: string
  paneLayout: PaneLayout; paneConfig: PaneConfig
  createdAt: string; updatedAt: string; lastActiveAt: string; metadata: Record<string,unknown>
}

export interface PaneConfig { panes: Pane[] }

export interface Pane {
  id: string; agentId?: string
  panel: 'chat'|'terminal'|'diff'|'graph'|'files'|'mcp'|'cost'|'templates'|'pipeline'
  size: number; position: number
}

export interface Pipeline {
  id: string; name: string; sessionId: string; status: PipelineStatus
  nodes: PipelineNode[]; edges: PipelineEdge[]
  createdAt: string; updatedAt: string; runs: PipelineRun[]
}

export interface PipelineNode {
  id: string; type: 'agent'|'input'|'output'|'condition'|'merge'|'parallel'|'transform'
  position: {x:number;y:number}; data: PipelineNodeData
}

export interface PipelineNodeData {
  label: string; agentId?: string; condition?: string
  transform?: string; config: Record<string,unknown>
}

export interface PipelineEdge {
  id: string; source: string; target: string
  label?: string; type?: 'default'|'conditional'|'error'|'parallel'; condition?: string
}

export interface PipelineRun {
  id: string; pipelineId: string; status: PipelineStatus
  startedAt: string; endedAt?: string; nodeResults: Record<string,unknown>; error?: string
}

export interface AgentTemplate {
  id: string; name: string; description: string; category: TemplateCategory
  provider: AIProvider; model: string; prompt: string
  tools: BuiltinTool[]; mcpServers: MCPServerTemplate[]
  tags: string[]; author: string; downloads: number; rating: number
  verified: boolean; builtin: boolean; createdAt: string; updatedAt: string; preview?: string
}

export interface MCPServerTemplate {
  name: string; transport: MCPTransport; command?: string; args?: string[]; url?: string
}

export interface CostEntry {
  id: string; agentId: string; sessionId: string; userId: string
  provider: AIProvider; model: string
  tokensIn: number; tokensOut: number; cost: number; timestamp: string
}

export interface CostSummary {
  total: number; byProvider: Record<string,number>; byModel: Record<string,number>
  byAgent: Record<string,number>; byDay: Array<{date:string;cost:number}>
  tokens: {in:number;out:number}
}

export interface SearchResult {
  type: 'message'|'file'|'agent'|'workspace'|'template'
  id: string; title: string; excerpt: string; score: number
  agentId?: string; timestamp?: string; path?: string
}

export interface User {
  id: string; email: string; name: string; avatar?: string
  role: UserRole; teamId?: string; authProvider: AuthProvider
  createdAt: string; lastLoginAt: string; preferences: UserPreferences
}

export interface UserPreferences {
  theme: ThemeMode; fontSize: number; fontFamily: string; terminalTheme: string
  defaultProvider: AIProvider; defaultModel: string; autoSave: boolean
  telemetry: boolean; keymap: 'default'|'vim'|'emacs'
  defaultLayout: PaneLayout; shortcuts: Record<string,string>
}

export interface Team {
  id: string; name: string; plan: 'free'|'pro'|'enterprise'
  members: TeamMember[]; settings: TeamSettings; createdAt: string
}

export interface TeamMember { userId: string; role: UserRole; joinedAt: string }

export interface TeamSettings {
  ssoEnabled: boolean; samlConfig?: SAMLConfig; oauth2Config?: OAuth2Config
  allowedDomains: string[]; auditLogs: boolean; selfHosted: boolean; costLimit?: number
}

export interface SAMLConfig { entryPoint: string; issuer: string; cert: string; callbackUrl: string }
export interface OAuth2Config {
  provider: string; clientId: string; clientSecret: string
  authorizationURL: string; tokenURL: string; callbackURL: string; scope: string[]
}

export interface ProviderConfig {
  provider: AIProvider; apiKey?: string; baseUrl?: string; models: ModelInfo[]; enabled: boolean
}

export interface ModelInfo {
  id: string; name: string; contextLength: number
  inputCost: number; outputCost: number; capabilities: string[]
}

export interface AuditEvent {
  id: string; userId: string; teamId?: string; action: string
  resource: string; resourceId: string; metadata: Record<string,unknown>
  ip?: string; userAgent?: string; timestamp: string
  severity: 'low'|'medium'|'high'|'critical'
}

export interface CollabEvent {
  type: 'agent_update'|'message'|'cursor'|'presence'|'diff'
  userId: string; sessionId: string; payload: unknown; timestamp: string
}

export interface UserPresence {
  userId: string; name: string; avatar?: string; sessionId: string
  agentId?: string; panel?: string; lastSeen: string; color: string
}

export interface AppSettings {
  providers: ProviderConfig[]; workspace: WorkspaceSettings; auth: AuthSettings
  appearance: AppearanceSettings; mcp: MCPSettings
  collab: CollabSettings; telemetry: boolean; updateChannel: 'stable'|'beta'|'nightly'
}

export interface WorkspaceSettings {
  defaultPath: string; gitAutoCommit: boolean
  dockerEnabled: boolean; maxAgents: number; queueSize: number
}

export interface AuthSettings {
  provider: AuthProvider; saml?: SAMLConfig; oauth2?: OAuth2Config
  jwtSecret: string; sessionTTL: number
}

export interface AppearanceSettings {
  theme: ThemeMode; accentColor: string; fontSize: number
  fontFamily: string; density: 'compact'|'normal'|'spacious'
  animations: boolean; defaultLayout: PaneLayout
}

export interface MCPSettings { servers: MCPServer[]; autoConnect: boolean; timeoutMs: number }
export interface CollabSettings { enabled: boolean; serverUrl: string; roomId?: string }

export interface TerminalSession {
  id: string; agentId?: string; workspaceId: string
  pid?: number; alive: boolean; title: string; createdAt: string
}
