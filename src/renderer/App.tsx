import React, { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useStore } from './store'
import { ipc } from './hooks/useIPC'
import { KeyboardShortcuts } from './components/layout/KeyboardShortcuts'
import { MainLayout }     from './components/layout/MainLayout'
import { AuthPage }       from './pages/AuthPage'
import { GlobalSearch }   from './components/search/GlobalSearch'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import type { Agent, AgentMessage, MCPServer, UserPresence } from '../shared/types'

function AppInner() {
  const {
    token, user, ui,
    setUser, setToken, setAgents, setWorkspaces, setSettings,
    upsertAgent, updateAgentStatus, appendMessage, streamChunk, finalizeStream,
    setMCPServers, upsertMCPServer, setSessions, setCostSummary,
    setTemplates, upsertPresence,
  } = useStore()

  // ─── Bootstrap data load ──────────────────────────────
  useEffect(() => {
    if (!token) return

    // Load all initial data in parallel
    ipc.agents.list().then(d => {
      const agentList = (d ?? []) as import('../shared/types').Agent[]
      setAgents(agentList)
      // Auto-select first agent if none selected
      if (agentList.length > 0 && !useStore.getState().ui.selectedAgentId) {
        useStore.getState().selectAgent(agentList[0].id)
      }
    }).catch(console.error)
    ipc.workspaces.list().then(d => setWorkspaces(d as import('../shared/types').Workspace[])).catch(console.error)
    ipc.settings.get().then(d => setSettings(d as import('../shared/types').AppSettings)).catch(console.error)

    ipc.invoke?.('mcp:list')
      .then((d: unknown) => setMCPServers((d ?? []) as MCPServer[]))
      .catch(console.error)

    ipc.invoke?.('sessions:list', { userId: useStore.getState().user?.id ?? 'system' })
      .then((d: unknown) => setSessions((d ?? []) as ReturnType<typeof useStore.getState>['sessions']))
      .catch(console.error)

    ipc.invoke?.('templates:list', {})
      .then((d: unknown) => setTemplates((d ?? []) as ReturnType<typeof useStore.getState>['templates']))
      .catch(console.error)

    ipc.invoke?.('cost:summary', {})
      .then((d: unknown) => { if (d) setCostSummary(d as import('../shared/types').CostSummary) })
      .catch(console.error)

    ipc.auth.me({ token })
      .then((u: unknown) => {
        if (u) setUser(u as ReturnType<typeof useStore.getState>['user'])
        else { setToken(null); setUser(null) }
      })
      .catch(() => { setToken(null); setUser(null) })
  }, [token])

  // ─── IPC event listeners ──────────────────────────────
  useEffect(() => {
    const subs: Array<() => void> = []

    if (ipc.agents.onStatusChange) {
      subs.push(ipc.agents.onStatusChange((d: unknown) => {
        const x = d as { agentId: string; status: Agent['status'] }
        updateAgentStatus(x.agentId, x.status)
      }))
    }

    if (ipc.agents.onMessageChunk) {
      subs.push(ipc.agents.onMessageChunk((d: unknown) => {
        const x = d as { agentId:string; chunk?:string; msgId?:string; message?:AgentMessage; done?:boolean }
        if (x.done && x.message)       finalizeStream(x.agentId, x.msgId ?? '', x.message)
        else if (x.chunk)              streamChunk(x.agentId, x.msgId ?? '', x.chunk)
        else if (x.message && !x.done) appendMessage(x.agentId, x.message)
      }))
    }

    if (ipc.agents.onToolCall) {
      subs.push(ipc.agents.onToolCall((d: unknown) => {
        const x = d as { agentId: string }
        ipc.agents.get(x.agentId)
          .then((a: unknown) => { if (a) upsertAgent(a as Agent) })
          .catch(() => {})
      }))
    }

    const u1 = ipc.on?.('mcp:server-update', (d: unknown) => upsertMCPServer(d as MCPServer))
    const u2 = ipc.on?.('collab:presence',   (d: unknown) => upsertPresence(d as UserPresence))
    if (u1) subs.push(u1)
    if (u2) subs.push(u2)

    return () => subs.forEach(u => u?.())
  }, [])

  // ─── Auth guard ───────────────────────────────────────
  if (!token && !user) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*"     element={<Navigate to="/auth" replace />} />
        </Routes>
      </HashRouter>
    )
  }

  // ─── Onboarding guard ─────────────────────────────────
  if (!ui.onboardingComplete) {
    return <OnboardingFlow />
  }

  return (
    <HashRouter>
      {/* Global keyboard shortcuts */}
      <KeyboardShortcuts />

      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*"     element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global overlays */}
      <AnimatePresence>
        {ui.searchOpen && <GlobalSearch key="search" />}
      </AnimatePresence>
    </HashRouter>
  )
}

export function App() {
  return <AppInner />
}
