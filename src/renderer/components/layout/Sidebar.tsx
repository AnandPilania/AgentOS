import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { Bot, FolderGit2, Clock, Plus, Play, Square, Copy, Trash2, Sparkles, FolderOpen, X } from 'lucide-react'
import type { Agent, Workspace, Session } from '../../../shared/types'

const TABS = [
  { id:'agents',     label:'Agents',     icon:<Bot size={12}/> },
  { id:'workspaces', label:'Workspaces', icon:<FolderGit2 size={12}/> },
  { id:'sessions',   label:'Sessions',   icon:<Clock size={12}/> },
  { id:'templates',  label:'Templates',  icon:<Sparkles size={12}/> },
] as const

export function Sidebar() {
  const {
    ui, setActiveSidebar, agents, workspaces, sessions, templates,
    selectAgent, selectWorkspace, selectSession, toggleNewAgent,
    removeAgent, upsertAgent, setActivePanel, upsertWorkspace, removeWorkspace,
  } = useStore()

  const [showNewWs, setShowNewWs] = useState(false)

  const handleNew = () => {
    if (ui.activeSidebar === 'workspaces') setShowNewWs(true)
    else if (ui.activeSidebar === 'templates') setActivePanel('templates')
    else toggleNewAgent()
  }

  const newLabel = ui.activeSidebar === 'workspaces' ? 'New Workspace'
    : ui.activeSidebar === 'templates' ? 'Browse'
    : 'New Agent'

  return (
    <div className="flex flex-col h-full overflow-hidden bg-carbon-975">
      {/* Tabs */}
      <div className="flex border-b border-carbon-900 px-2 pt-2 gap-0.5 flex-shrink-0">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveSidebar(tab.id)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-t-md text-xs font-medium transition-colors border-b-2 -mb-px ${
              ui.activeSidebar === tab.id
                ? 'border-void-500 text-white bg-carbon-925'
                : 'border-transparent text-carbon-500 hover:text-carbon-300'
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-carbon-900 flex-shrink-0">
        <span className="text-xs text-carbon-600 font-mono">
          {ui.activeSidebar === 'agents'     ? `${agents.length} agent${agents.length !== 1 ? 's' : ''}`
           : ui.activeSidebar === 'workspaces' ? `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}`
           : ui.activeSidebar === 'sessions'   ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`
           : `${templates.length} templates`}
        </span>
        <button onClick={handleNew}
          className="flex items-center gap-1 text-xs text-carbon-400 hover:text-white hover:bg-carbon-800 px-1.5 py-0.5 rounded transition-colors">
          <Plus size={11}/>{newLabel}
        </button>
      </div>

      {/* New workspace form */}
      <AnimatePresence>
        {showNewWs && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
            className="overflow-hidden flex-shrink-0">
            <NewWorkspaceForm
              onCreated={(ws) => { upsertWorkspace(ws); setShowNewWs(false); selectWorkspace(ws.id) }}
              onCancel={() => setShowNewWs(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        <AnimatePresence>
          {ui.activeSidebar === 'agents' && (
            agents.length === 0
              ? <EmptyState icon={<Bot size={24}/>} text="No agents yet" sub="Click New Agent to create one" action={toggleNewAgent} actionLabel="New Agent" />
              : agents.map(a => (
                <AgentRow key={a.id} agent={a} selected={ui.selectedAgentId === a.id}
                  onSelect={() => { selectAgent(a.id) }}
                  onStart={async () => {
                    await ipc.agents.start(a.id)
                    const u = await ipc.agents.get(a.id)
                    if (u) upsertAgent(u as Agent)
                  }}
                  onStop={async () => {
                    await ipc.agents.stop(a.id)
                    const u = await ipc.agents.get(a.id)
                    if (u) upsertAgent(u as Agent)
                  }}
                  onClone={async () => {
                    const c = await ipc.agents.clone(a.id)
                    if (c) upsertAgent(c as Agent)
                  }}
                  onDelete={async () => {
                    await ipc.agents.destroy(a.id)
                    removeAgent(a.id)
                  }}/>
              ))
          )}

          {ui.activeSidebar === 'workspaces' && (
            workspaces.length === 0
              ? <EmptyState icon={<FolderGit2 size={24}/>} text="No workspaces" sub="Click New Workspace to add one" action={() => setShowNewWs(true)} actionLabel="New Workspace" />
              : workspaces.map(ws => (
                <WsRow key={ws.id} ws={ws} selected={ui.selectedWsId === ws.id}
                  onSelect={() => { selectWorkspace(ws.id); setActivePanel('files') }}
                  onDelete={async () => {
                    await ipc.workspaces.delete(ws.id)
                    removeWorkspace(ws.id)
                  }}/>
              ))
          )}

          {ui.activeSidebar === 'sessions' && (
            sessions.length === 0
              ? <EmptyState icon={<Clock size={24}/>} text="No sessions" sub="Sessions are created automatically when you chat" />
              : sessions.map(s => (
                <SessRow key={s.id} session={s} selected={ui.selectedSessionId === s.id}
                  onSelect={() => selectSession(s.id)} />
              ))
          )}

          {ui.activeSidebar === 'templates' && (
            <div className="p-3 space-y-2">
              <p className="text-xs text-carbon-500 px-1">
                Use templates to quickly create agents with pre-configured prompts and tools.
              </p>
              <button onClick={() => setActivePanel('templates')}
                className="w-full py-2.5 bg-void-500/15 hover:bg-void-500/25 border border-void-500/30 text-void-300 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2">
                <Sparkles size={12}/> Browse {templates.length} Templates
              </button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── New Workspace Form ──────────────────────────────────────────────────────
function NewWorkspaceForm({ onCreated, onCancel }: {
  onCreated: (ws: Workspace) => void
  onCancel: () => void
}) {
  const [name,    setName]    = useState('')
  const [path,    setPath]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const browse = async () => {
    const result = await ipc.app.showDialog({ properties: ['openDirectory'] }) as { filePaths?: string[]; canceled?: boolean }
    if (result?.filePaths?.[0]) {
      setPath(result.filePaths[0])
      if (!name) setName(result.filePaths[0].split(/[/\\]/).pop() ?? 'My Workspace')
    }
  }

  const create = async () => {
    if (!path.trim()) { setError('Path is required'); return }
    setLoading(true); setError('')
    try {
      const ws = await ipc.workspaces.create({
        name: name.trim() || path.split(/[/\\]/).pop() || 'Workspace',
        path: path.trim(),
        type: 'folder',
      }) as Workspace
      onCreated(ws)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-b border-carbon-900 bg-carbon-950 p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-carbon-400 uppercase tracking-wide">New Workspace</span>
        <button onClick={onCancel} className="text-carbon-600 hover:text-white transition-colors">
          <X size={13}/>
        </button>
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)"
        className="selectable w-full bg-carbon-975 border border-carbon-800 focus:border-void-500 rounded-lg px-3 py-1.5 text-xs text-carbon-200 placeholder-carbon-600 outline-none transition-colors"/>
      <div className="flex gap-1.5">
        <input value={path} onChange={e => setPath(e.target.value)} placeholder="/path/to/project"
          className="selectable flex-1 bg-carbon-975 border border-carbon-800 focus:border-void-500 rounded-lg px-3 py-1.5 text-xs font-mono text-carbon-200 placeholder-carbon-600 outline-none transition-colors"/>
        <button onClick={browse} className="px-2.5 py-1.5 bg-carbon-900 border border-carbon-700 hover:border-carbon-500 text-carbon-400 hover:text-white rounded-lg text-xs transition-colors flex-shrink-0">
          <FolderOpen size={12}/>
        </button>
      </div>
      {error && <p className="text-xs text-signal-red">{error}</p>}
      <button onClick={create} disabled={loading || !path.trim()}
        className="w-full py-1.5 bg-void-500/20 hover:bg-void-500/30 border border-void-500/30 text-void-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-40">
        {loading ? 'Creating…' : 'Create Workspace'}
      </button>
    </div>
  )
}

// ── AgentRow ────────────────────────────────────────────────────────────────
function AgentRow({ agent, selected, onSelect, onStart, onStop, onClone, onDelete }: {
  agent: Agent; selected: boolean
  onSelect: () => void; onStart: () => void; onStop: () => void
  onClone: () => void; onDelete: () => void
}) {
  const [h, setH] = useState(false)
  const isRunning = agent.status === 'running'

  return (
    <motion.div layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      onClick={onSelect} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors mx-1 my-0.5 rounded-lg ${
        selected ? 'bg-carbon-850 border border-void-500/20' : 'hover:bg-carbon-925'
      }`}>
      <span className={`status-dot ${agent.status} flex-shrink-0`}/>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-carbon-200 truncate">{agent.name}</div>
        <div className="text-xs text-carbon-600 truncate font-mono">
          {agent.provider} / {agent.model.split('-').slice(-2).join('-')}
        </div>
      </div>
      <div className={`flex items-center gap-0.5 transition-opacity ${h || selected ? 'opacity-100' : 'opacity-0'}`}>
        {isRunning
          ? <Btn onClick={e => { e.stopPropagation(); onStop() }}  title="Stop"   cl="hover:text-signal-red"><Square size={9}/></Btn>
          : <Btn onClick={e => { e.stopPropagation(); onStart() }} title="Start"  cl="hover:text-signal-green"><Play size={9}/></Btn>}
        <Btn onClick={e => { e.stopPropagation(); onClone() }}  title="Clone"  cl="hover:text-carbon-200"><Copy size={9}/></Btn>
        <Btn onClick={e => { e.stopPropagation(); onDelete() }} title="Delete" cl="hover:text-signal-red"><Trash2 size={9}/></Btn>
      </div>
    </motion.div>
  )
}

// ── WsRow ────────────────────────────────────────────────────────────────────
function WsRow({ ws, selected, onSelect, onDelete }: {
  ws: Workspace; selected: boolean; onSelect: () => void; onDelete: () => void
}) {
  const [h, setH] = useState(false)
  return (
    <div onClick={onSelect} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors mx-1 my-0.5 rounded-lg ${
        selected ? 'bg-carbon-850 border border-void-500/20' : 'hover:bg-carbon-925'
      }`}>
      <FolderGit2 size={12} className="text-void-400 flex-shrink-0"/>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-carbon-200 truncate">{ws.name}</div>
        <div className="text-xs text-carbon-600 truncate font-mono">{ws.branch ?? ws.type}</div>
      </div>
      <div className={`flex items-center gap-0.5 transition-opacity ${h || selected ? 'opacity-100' : 'opacity-0'}`}>
        <Btn onClick={e => { e.stopPropagation(); onDelete() }} title="Remove" cl="hover:text-signal-red"><Trash2 size={9}/></Btn>
      </div>
    </div>
  )
}

// ── SessRow ──────────────────────────────────────────────────────────────────
function SessRow({ session, selected, onSelect }: {
  session: Session; selected: boolean; onSelect: () => void
}) {
  return (
    <div onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors mx-1 my-0.5 rounded-lg ${
        selected ? 'bg-carbon-850 border border-void-500/20' : 'hover:bg-carbon-925'
      }`}>
      <Clock size={12} className="text-plasma-400 flex-shrink-0"/>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-carbon-200 truncate">{session.name}</div>
        <div className="text-xs text-carbon-600 truncate">
          {session.agentIds.length} agent{session.agentIds.length !== 1 ? 's' : ''} · {session.paneLayout}
        </div>
      </div>
    </div>
  )
}

// ── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState({ icon, text, sub, action, actionLabel }: {
  icon: React.ReactNode; text: string; sub: string; action?: () => void; actionLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
      <div className="text-carbon-700">{icon}</div>
      <p className="text-xs font-medium text-carbon-500">{text}</p>
      <p className="text-xs text-carbon-700">{sub}</p>
      {action && actionLabel && (
        <button onClick={action}
          className="mt-2 px-3 py-1.5 bg-void-500/15 hover:bg-void-500/25 border border-void-500/30 text-void-300 rounded-lg text-xs font-medium transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function Btn({ children, onClick, title, cl }: {
  children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string; cl?: string
}) {
  return (
    <button onClick={onClick} title={title}
      className={`w-5 h-5 flex items-center justify-center rounded text-carbon-600 transition-colors ${cl ?? ''}`}>
      {children}
    </button>
  )
}
