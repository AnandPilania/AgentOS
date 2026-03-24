import { create }  from 'zustand'
import { immer }   from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type {
  Agent, AgentMessage, Workspace, User, AppSettings,
  TerminalSession, FileDiff, Session, MCPServer,
  AgentTemplate, CostSummary, SearchResult,
  Pipeline, PaneLayout, PaneConfig, UserPresence
} from '../../shared/types'

export type ActivePanel = 'chat'|'terminal'|'diff'|'graph'|'files'|'mcp'|'cost'|'templates'|'pipeline'
export type SidebarTab  = 'agents'|'workspaces'|'sessions'|'templates'

interface UIState {
  activePanel:          ActivePanel
  activeSidebar:        SidebarTab
  selectedAgentId:      string | null
  selectedWsId:         string | null
  selectedSessionId:    string | null
  sidebarOpen:          boolean
  rightPanelOpen:       boolean
  commandPaletteOpen:   boolean
  settingsOpen:         boolean
  newAgentOpen:         boolean
  mcpOpen:              boolean
  searchOpen:           boolean
  onboardingComplete:   boolean
  sidebarWidth:         number
  rightWidth:           number
  // split pane
  paneLayout:           PaneLayout
  paneConfig:           PaneConfig
  activePaneId:         string | null
}

interface StreamState {
  [agentId: string]: { msgId: string; buffer: string }
}

export const useStore = create<AppStore>()(
  persist(
    immer((set, get) => ({
      // ─── Data ─────────────────────────────────────────
      agents: [], messages: {}, workspaces: [], terminals: [],
      diffs: {}, sessions: [], mcpServers: [], templates: [],
      costSummary: null, searchResults: [], searchQuery: '',
      pipelines: [], presence: [],
      user: null, token: null, settings: null, streams: {},

      // ─── UI ───────────────────────────────────────────
      ui: {
        activePanel: 'chat', activeSidebar: 'agents',
        selectedAgentId: null, selectedWsId: null, selectedSessionId: null,
        sidebarOpen: true, rightPanelOpen: true,
        commandPaletteOpen: false, settingsOpen: false,
        newAgentOpen: false, mcpOpen: false, searchOpen: false,
        onboardingComplete: false,
        sidebarWidth: 280, rightWidth: 320,
        paneLayout: 'single',
        paneConfig: { panes: [] },
        activePaneId: null,
      },

      // ─── Agent ────────────────────────────────────────
      setAgents:        (agents) => set(s => { s.agents = agents }),
      upsertAgent:      (agent)  => set(s => { const i = s.agents.findIndex(a => a.id === agent.id); if (i>=0) s.agents[i]=agent; else s.agents.unshift(agent) }),
      removeAgent:      (id)     => set(s => { s.agents = s.agents.filter(a => a.id !== id); if (s.ui.selectedAgentId === id) s.ui.selectedAgentId = null; delete s.messages[id] }),
      updateAgentStatus:(id, status) => set(s => { const a = s.agents.find(a => a.id === id); if (a) a.status = status }),
      setMessages:      (agentId, messages) => set(s => { s.messages[agentId] = messages }),
      appendMessage:    (agentId, msg)      => set(s => { if (!s.messages[agentId]) s.messages[agentId] = []; s.messages[agentId].push(msg) }),
      streamChunk:      (agentId, msgId, chunk) => set(s => { if (!s.streams[agentId]) s.streams[agentId] = { msgId, buffer:'' }; s.streams[agentId].buffer += chunk; s.streams[agentId].msgId = msgId }),
      finalizeStream:   (agentId, msgId, msg) => set(s => { delete s.streams[agentId]; if (!s.messages[agentId]) s.messages[agentId] = []; const i = s.messages[agentId].findIndex(m => m.id === msgId); if (i>=0) s.messages[agentId][i]=msg; else s.messages[agentId].push(msg) }),

      // ─── Workspace ────────────────────────────────────
      setWorkspaces:   (ws) => set(s => { s.workspaces = ws }),
      upsertWorkspace: (ws) => set(s => { const i = s.workspaces.findIndex(w => w.id === ws.id); if (i>=0) s.workspaces[i]=ws; else s.workspaces.unshift(ws) }),
      removeWorkspace: (id) => set(s => { s.workspaces = s.workspaces.filter(w => w.id !== id) }),
      setDiff:         (wsId, diffs) => set(s => { s.diffs[wsId] = diffs }),

      // ─── Terminal ─────────────────────────────────────
      setTerminals:    (t)  => set(s => { s.terminals = t }),
      addTerminal:     (t)  => set(s => { s.terminals.push(t) }),
      removeTerminal:  (id) => set(s => { s.terminals = s.terminals.filter(t => t.id !== id) }),

      // ─── Sessions ─────────────────────────────────────
      setSessions:    (sessions) => set(s => { s.sessions = sessions }),
      upsertSession:  (session)  => set(s => { const i = s.sessions.findIndex(x => x.id === session.id); if (i>=0) s.sessions[i]=session; else s.sessions.unshift(session) }),
      removeSession:  (id)       => set(s => { s.sessions = s.sessions.filter(x => x.id !== id) }),
      selectSession:  (id)       => set(s => {
        s.ui.selectedSessionId = id
        const sess = s.sessions.find(x => x.id === id)
        if (sess) {
          s.ui.paneLayout = sess.paneLayout
          s.ui.paneConfig = sess.paneConfig
        }
      }),

      // ─── MCP ──────────────────────────────────────────
      setMCPServers:    (servers) => set(s => { s.mcpServers = servers }),
      upsertMCPServer:  (srv)     => set(s => { const i = s.mcpServers.findIndex(x => x.id === srv.id); if (i>=0) s.mcpServers[i]=srv; else s.mcpServers.push(srv) }),
      removeMCPServer:  (id)      => set(s => { s.mcpServers = s.mcpServers.filter(x => x.id !== id) }),

      // ─── Templates ────────────────────────────────────
      setTemplates:   (templates) => set(s => { s.templates = templates }),

      // ─── Cost ─────────────────────────────────────────
      setCostSummary: (summary) => set(s => { s.costSummary = summary }),

      // ─── Search ───────────────────────────────────────
      setSearchQuery:   (q)       => set(s => { s.searchQuery = q }),
      setSearchResults: (results) => set(s => { s.searchResults = results }),

      // ─── Pipelines ────────────────────────────────────
      setPipelines:   (pipelines) => set(s => { s.pipelines = pipelines }),
      upsertPipeline: (pipeline)  => set(s => { const i = s.pipelines.findIndex(p => p.id === pipeline.id); if (i>=0) s.pipelines[i]=pipeline; else s.pipelines.push(pipeline) }),

      // ─── Presence ─────────────────────────────────────
      setPresence:   (p) => set(s => { s.presence = p }),
      upsertPresence:(p) => set(s => { const i = s.presence.findIndex(x => x.userId === p.userId); if (i>=0) s.presence[i]=p; else s.presence.push(p) }),

      // ─── Auth ─────────────────────────────────────────
      setUser:     (user)     => set(s => { s.user = user }),
      setToken:    (token)    => set(s => { s.token = token }),
      setSettings: (settings) => set(s => { s.settings = settings }),

      // ─── UI ───────────────────────────────────────────
      setActivePanel:       (panel)  => set(s => { s.ui.activePanel = panel }),
      setActiveSidebar:     (tab)    => set(s => { s.ui.activeSidebar = tab }),
      selectAgent:          (id)     => set(s => { s.ui.selectedAgentId = id }),
      selectWorkspace:      (id)     => set(s => { s.ui.selectedWsId = id }),
      toggleSidebar:        ()       => set(s => { s.ui.sidebarOpen = !s.ui.sidebarOpen }),
      toggleRightPanel:     ()       => set(s => { s.ui.rightPanelOpen = !s.ui.rightPanelOpen }),
      toggleCommandPalette: ()       => set(s => { s.ui.commandPaletteOpen = !s.ui.commandPaletteOpen }),
      toggleSettings:       ()       => set(s => { s.ui.settingsOpen = !s.ui.settingsOpen }),
      toggleNewAgent:       ()       => set(s => { s.ui.newAgentOpen = !s.ui.newAgentOpen }),
      toggleMCP:            ()       => set(s => { s.ui.mcpOpen = !s.ui.mcpOpen }),
      toggleSearch:         ()       => set(s => { s.ui.searchOpen = !s.ui.searchOpen }),
      completeOnboarding:   ()       => set(s => { s.ui.onboardingComplete = true }),
      setSidebarWidth:      (w)      => set(s => { s.ui.sidebarWidth = Math.max(200, Math.min(480, w)) }),
      setRightWidth:        (w)      => set(s => { s.ui.rightWidth = Math.max(240, Math.min(600, w)) }),
      setPaneLayout:        (layout) => set(s => { s.ui.paneLayout = layout }),
      setPaneConfig:        (config) => set(s => { s.ui.paneConfig = config }),
      setActivePaneId:      (id)     => set(s => { s.ui.activePaneId = id }),

      // Pane panel override for a specific pane
      setPanelForPane: (paneId, panel) => set(s => {
        const pane = s.ui.paneConfig.panes.find(p => p.id === paneId)
        if (pane) pane.panel = panel as import('../../shared/types').Pane['panel']
      }),
      setAgentForPane: (paneId, agentId) => set(s => {
        const pane = s.ui.paneConfig.panes.find(p => p.id === paneId)
        if (pane) pane.agentId = agentId
      }),
    })),
    {
      name:    'agentos-ui',
      partialize: (state: AppStore) => ({
        token:               state.token,
        ui: {
          sidebarWidth:      state.ui.sidebarWidth,
          rightWidth:        state.ui.rightWidth,
          onboardingComplete:state.ui.onboardingComplete,
          paneLayout:        state.ui.paneLayout,
        },
      }),
    }
  )
)

// ─── Type for store ────────────────────────────────────────
interface AppStore {
  agents:        Agent[]
  messages:      Record<string, AgentMessage[]>
  workspaces:    Workspace[]
  terminals:     TerminalSession[]
  diffs:         Record<string, FileDiff[]>
  sessions:      Session[]
  mcpServers:    MCPServer[]
  templates:     AgentTemplate[]
  costSummary:   CostSummary | null
  searchResults: SearchResult[]
  searchQuery:   string
  pipelines:     Pipeline[]
  presence:      UserPresence[]
  user:          User | null
  token:         string | null
  settings:      AppSettings | null
  streams:       Record<string, { msgId:string; buffer:string }>
  ui:            UIState

  setAgents:         (a: Agent[]) => void
  upsertAgent:       (a: Agent)   => void
  removeAgent:       (id: string) => void
  updateAgentStatus: (id: string, status: Agent['status']) => void
  setMessages:       (agentId: string, msgs: AgentMessage[]) => void
  appendMessage:     (agentId: string, msg: AgentMessage)    => void
  streamChunk:       (agentId: string, msgId: string, chunk: string) => void
  finalizeStream:    (agentId: string, msgId: string, msg: AgentMessage) => void

  setWorkspaces:   (ws: Workspace[]) => void
  upsertWorkspace: (ws: Workspace)   => void
  removeWorkspace: (id: string)      => void
  setDiff:         (wsId: string, diffs: FileDiff[]) => void

  setTerminals:    (t: TerminalSession[]) => void
  addTerminal:     (t: TerminalSession)   => void
  removeTerminal:  (id: string)           => void

  setSessions:    (s: Session[]) => void
  upsertSession:  (s: Session)   => void
  removeSession:  (id: string)   => void
  selectSession:  (id: string)   => void

  setMCPServers:   (s: MCPServer[]) => void
  upsertMCPServer: (s: MCPServer)   => void
  removeMCPServer: (id: string)     => void

  setTemplates:    (t: AgentTemplate[]) => void
  setCostSummary:  (s: CostSummary)     => void
  setSearchQuery:  (q: string)          => void
  setSearchResults:(r: SearchResult[])  => void
  setPipelines:    (p: Pipeline[])      => void
  upsertPipeline:  (p: Pipeline)        => void
  setPresence:     (p: UserPresence[])  => void
  upsertPresence:  (p: UserPresence)    => void

  setUser:         (u: User | null)      => void
  setToken:        (t: string | null)    => void
  setSettings:     (s: AppSettings)      => void

  setActivePanel:       (p: ActivePanel) => void
  setActiveSidebar:     (t: SidebarTab)  => void
  selectAgent:          (id: string | null) => void
  selectWorkspace:      (id: string | null) => void
  toggleSidebar:        () => void
  toggleRightPanel:     () => void
  toggleCommandPalette: () => void
  toggleSettings:       () => void
  toggleNewAgent:       () => void
  toggleMCP:            () => void
  toggleSearch:         () => void
  completeOnboarding:   () => void
  setSidebarWidth:      (w: number) => void
  setRightWidth:        (w: number) => void
  setPaneLayout:        (l: PaneLayout) => void
  setPaneConfig:        (c: PaneConfig) => void
  setActivePaneId:      (id: string | null) => void
  setPanelForPane:      (paneId: string, panel: ActivePanel) => void
  setAgentForPane:      (paneId: string, agentId: string)    => void
}
