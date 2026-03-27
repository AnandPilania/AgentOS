import React, {
  useCallback, useEffect, useRef, useState,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import {
  Users, Send, Square, RefreshCw, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Bot, Database, Loader,
  Plus, Trash2, Settings, FolderOpen, Folder, FileCode,
  GitCompare, History, MessageSquare, Search, X,
  Check, AlertTriangle, ChevronLeft, Eye,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────
type TeamRole = 'leader' | 'analyst' | 'developer' | 'qa'
type LeaderAction = 'answer' | 'analyst' | 'developer' | 'qa' | 'done'
type TeamRunStatus = 'idle' | 'leader_thinking' | 'analyst_working' | 'developer_working' | 'qa_working' | 'done' | 'error' | 'max_steps'

interface TeamMember  { role: TeamRole; name: string; agentId: string; model: string; provider: string }
interface TeamConfig  { id: string; name: string; workspaceId: string; sessionId: string; members: TeamMember[]; maxSteps: number; createdAt: string; updatedAt: string }
interface FileDiffSummary { filesChanged: string[]; additions: number; deletions: number; rawDiff: string }
interface LeaderDecision  { nextAction: LeaderAction; reasoning: string; instruction?: string; answer?: string }
interface TeamMessage     { id: string; role: 'user'|'leader'|'analyst'|'developer'|'qa'|'system'; content: string; streaming: boolean; timestamp: string; fileDiff?: FileDiffSummary; leaderDecision?: LeaderDecision }
interface TeamRun         { id: string; teamId: string; userMessage: string; status: TeamRunStatus; steps: number; maxSteps: number; startedAt: string; endedAt?: string; error?: string; messages: TeamMessage[]; contextFiles: string[] }
interface IndexStats      { totalFiles: number; totalChunks: number; provider: string; indexedAt: string }
interface FileNode        { name: string; path: string; type: 'file'|'directory'; size?: number; children?: FileNode[] }
interface ConvMessage     { role: string; content: string; timestamp: string }

type Tab = 'chat' | 'history' | 'files' | 'settings'

const ROLE_COLOR: Record<string, string> = {
  leader:    'text-void-400',
  analyst:   'text-blue-400',
  developer: 'text-plasma-400',
  qa:        'text-signal-green',
  user:      'text-carbon-200',
}
const ROLE_BG: Record<string, string> = {
  leader:    'bg-void-500/10 border-void-500/20',
  analyst:   'bg-blue-500/10 border-blue-500/20',
  developer: 'bg-plasma-500/10 border-plasma-500/20',
  qa:        'bg-signal-green/10 border-signal-green/20',
  user:      'bg-carbon-900 border-carbon-800',
}
const STATUS_ICON: Record<TeamRunStatus, React.ReactNode> = {
  idle:              <span className="w-2 h-2 rounded-full bg-carbon-600"/>,
  leader_thinking:   <Loader size={11} className="animate-spin text-void-400"/>,
  analyst_working:   <Loader size={11} className="animate-spin text-blue-400"/>,
  developer_working: <Loader size={11} className="animate-spin text-plasma-400"/>,
  qa_working:        <Loader size={11} className="animate-spin text-signal-green"/>,
  done:              <CheckCircle2 size={11} className="text-signal-green"/>,
  error:             <XCircle size={11} className="text-signal-red"/>,
  max_steps:         <AlertTriangle size={11} className="text-signal-yellow"/>,
}
const STATUS_LABEL: Record<TeamRunStatus, string> = {
  idle: '', leader_thinking: 'Leader thinking…', analyst_working: 'Analyst working…',
  developer_working: 'Developer coding…', qa_working: 'QA reviewing…',
  done: 'Done', error: 'Error', max_steps: 'Max steps reached',
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'] },
  { id: 'openai',    label: 'OpenAI',    models: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'ollama',    label: 'Ollama',    models: ['phi4-mini:latest', 'qwen2.5-coder:1.5b-instruct', 'llama3.1:8b', 'qwen2.5-coder:1.5b-base', 'mistral:latest', 'qwen:0.5b', 'tinyllama:1.1b-chat', 'codellama:latest', 'phi4:14b-q4_K_M', 'deepseek-r1:1.5b', 'deepseek-r1:14b-qwen-distill-q4_K_M', 'deepseek-r1:1.5b-qwen-distill-q4_K_M'] },
]

// ─── Main panel ───────────────────────────────────────────────────────────
export function TeamPanel() {
  const { workspaces, ui } = useStore()
  const [teams,       setTeams]       = useState<TeamConfig[]>([])
  const [activeTeam,  setActiveTeam]  = useState<TeamConfig | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [tab,         setTab]         = useState<Tab>('chat')

  const loadTeams = useCallback(async () => {
    const list = await ipc.invoke?.('team:list', {}) as TeamConfig[] | undefined
    setTeams(list ?? [])
    if (list?.length && !activeTeam) setActiveTeam(list[0])
  }, []) // eslint-disable-line

  useEffect(() => { loadTeams() }, [loadTeams])

  if (showCreate) return (
    <CreateTeamView
      workspaces={workspaces}
      sessionId={ui.selectedSessionId ?? 'default'}
      onCreated={t => { setTeams(p => [t, ...p]); setActiveTeam(t); setShowCreate(false) }}
      onBack={() => setShowCreate(false)}
    />
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header justify-between px-4 flex-shrink-0">
        <span className="flex items-center gap-2">
          <Users size={13} className="text-void-400"/>
          {activeTeam ? activeTeam.name : 'Agent Teams'}
        </span>
        <div className="flex items-center gap-1">
          {activeTeam && teams.length > 1 && (
            <select
              value={activeTeam.id}
              onChange={e => setActiveTeam(teams.find(t => t.id === e.target.value) ?? null)}
              className="text-xs bg-carbon-950 border border-carbon-800 rounded px-2 py-1 text-carbon-300 outline-none"
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs bg-void-500/20 hover:bg-void-500/30 border border-void-500/30 text-void-300 px-2 py-1 rounded-lg transition-colors"
          >
            <Plus size={11}/> New
          </button>
        </div>
      </div>

      {!activeTeam ? (
        <EmptyNoTeam onCreate={() => setShowCreate(true)}/>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-carbon-900 flex-shrink-0 bg-carbon-975">
            {(['chat','history','files','settings'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                  tab === t ? 'border-void-500 text-white' : 'border-transparent text-carbon-500 hover:text-carbon-300'
                }`}
              >
                {t === 'chat'     && <MessageSquare size={11}/>}
                {t === 'history'  && <History size={11}/>}
                {t === 'files'    && <FolderOpen size={11}/>}
                {t === 'settings' && <Settings size={11}/>}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'chat'     && <ChatTab     team={activeTeam}/>}
          {tab === 'history'  && <HistoryTab  team={activeTeam}/>}
          {tab === 'files'    && <FilesTab    team={activeTeam} workspaces={workspaces}/>}
          {tab === 'settings' && <SettingsTab team={activeTeam} onUpdated={t => { setActiveTeam(t); setTeams(p => p.map(x => x.id === t.id ? t : x)) }} onDelete={() => { setTeams(p => p.filter(x => x.id !== activeTeam!.id)); setActiveTeam(null) }}/>}
        </>
      )}
    </div>
  )
}

// ─── Chat tab ─────────────────────────────────────────────────────────────
function ChatTab({ team }: { team: TeamConfig }) {
  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [activeRun,    setActiveRun]    = useState<TeamRun | null>(null)
  const [streamBuffers,setStreamBuffers]= useState<Record<TeamRole, string>>({} as Record<TeamRole, string>)
  const [contextFiles, setContextFiles] = useState<string[]>([])
  const [showCtxPicker,setShowCtxPicker]= useState(false)
  const [idxStats,     setIdxStats]     = useState<IndexStats | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textRef   = useRef<HTMLTextAreaElement>(null)

  // Load index stats
  useEffect(() => {
    ipc.invoke?.('context:stats', team.workspaceId)
      .then(s => setIdxStats(s as IndexStats ?? null))
      .catch(() => {})
  }, [team.workspaceId])

  // Live events
  useEffect(() => {
    const subs: Array<() => void> = []
    const on = (ch: string, cb: (d: unknown) => void) => {
      const u = ipc.on?.(`team:${ch}`, cb); if (u) subs.push(u)
    }

    on('run-status', d => {
      const { runId, status } = d as { runId: string; status: TeamRunStatus }
      setActiveRun(prev => prev?.id === runId ? { ...prev, status } : prev)
    })

    on('run-message', d => {
      const { runId, message } = d as { runId: string; message: TeamMessage }
      setActiveRun(prev => {
        if (!prev || prev.id !== runId) return prev
        const exists = prev.messages.find(m => m.id === message.id)
        const messages = exists
          ? prev.messages.map(m => m.id === message.id ? message : m)
          : [...prev.messages, message]
        return { ...prev, messages }
      })
      // Clear stream buffer for this role when a complete message arrives
      setStreamBuffers(prev => ({ ...prev, [message.role]: '' }))
    })

    on('run-chunk', d => {
      const { runId, role, chunk } = d as { runId: string; role: TeamRole; chunk: string }
      setActiveRun(prev => {
        if (!prev || prev.id !== runId) return prev
        return prev  // run object unchanged, just stream buffer
      })
      setStreamBuffers(prev => ({ ...prev, [role]: (prev[role] ?? '') + chunk }))
    })

    on('run-end', async d => {
      const run = d as TeamRun
      // Fetch final state
      const updated = await ipc.invoke?.('team:get-run', run.id) as TeamRun | undefined
      setActiveRun(updated ?? run)
      setStreamBuffers({} as Record<TeamRole, string>)
      setSending(false)
    })

    return () => subs.forEach(u => u())
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeRun?.messages?.length, Object.values(streamBuffers).join('').length])

  const send = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    setStreamBuffers({} as Record<TeamRole, string>)
    try {
      const run = await ipc.invoke?.('team:send', {
        teamId: team.id, message: input.trim(),
        contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
      }) as TeamRun
      setActiveRun(run)
      setInput('')
      if (textRef.current) { textRef.current.style.height = 'auto' }
    } catch (e) { setSending(false); console.error(e) }
  }

  const isRunning = activeRun && !['done','error','max_steps','idle'].includes(activeRun.status)
  const currentRole = activeRun?.status.replace('_working','').replace('_thinking','') as TeamRole | undefined

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Index bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-carbon-900 bg-carbon-975 text-xs flex-shrink-0">
        <Database size={10} className={idxStats ? 'text-signal-green' : 'text-carbon-700'}/>
        {idxStats
          ? <span className="text-carbon-500">{idxStats.totalFiles} files indexed · {idxStats.provider}</span>
          : <span className="text-carbon-700">Not indexed</span>}
        <button
          onClick={async () => {
            await ipc.invoke?.('context:index', { workspaceId: team.workspaceId, force: true })
            const s = await ipc.invoke?.('context:stats', team.workspaceId) as IndexStats | undefined
            setIdxStats(s ?? null)
          }}
          className="ml-auto text-carbon-600 hover:text-carbon-300 transition-colors"
          title="Re-index workspace"
        >
          <RefreshCw size={10}/>
        </button>
        <button
          onClick={() => setShowCtxPicker(v => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
            contextFiles.length > 0
              ? 'bg-void-500/20 border border-void-500/30 text-void-300'
              : 'text-carbon-600 hover:text-carbon-300'
          }`}
        >
          <FolderOpen size={10}/>
          {contextFiles.length > 0 ? `${contextFiles.length} files selected` : 'Select context files'}
        </button>
      </div>

      {/* Context file picker */}
      <AnimatePresence>
        {showCtxPicker && (
          <motion.div
            initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
            className="overflow-hidden border-b border-carbon-900 flex-shrink-0"
          >
            <ContextFilePicker
              team={team}
              selected={contextFiles}
              onChange={setContextFiles}
              onClose={() => setShowCtxPicker(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 selectable">
        {(!activeRun || activeRun.messages.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Users size={28} className="text-carbon-700 mb-2"/>
            <p className="text-sm text-carbon-500">Team {team.name} ready</p>
            <p className="text-xs text-carbon-700 mt-1">Ask anything — the leader decides who to involve</p>
          </div>
        ) : (
          activeRun.messages.map(msg => (
            <MessageBubble key={msg.id} message={msg}/>
          ))
        )}

        {/* Live streaming indicators */}
        {isRunning && currentRole && streamBuffers[currentRole as TeamRole] && (
          <StreamingBubble
            role={currentRole as TeamRole}
            buffer={streamBuffers[currentRole as TeamRole]}
          />
        )}

        {/* Status indicator */}
        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-carbon-500 pl-1">
            {STATUS_ICON[activeRun.status]}
            <span>{STATUS_LABEL[activeRun.status]}</span>
            <span className="text-carbon-700">· step {activeRun.steps}/{activeRun.maxSteps}</span>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-carbon-900 p-3">
        <div className="flex gap-2 items-end bg-carbon-950 border border-carbon-800 focus-within:border-void-500/60 rounded-xl transition-colors p-2">
          <textarea
            ref={textRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              if (textRef.current) {
                textRef.current.style.height = 'auto'
                textRef.current.style.height = `${Math.min(textRef.current.scrollHeight, 160)}px`
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask the team anything… (Enter to send)"
            rows={1}
            disabled={sending}
            className="flex-1 bg-transparent resize-none outline-none text-xs text-carbon-100 placeholder-carbon-600 selectable leading-relaxed py-1 px-1 font-mono disabled:opacity-50"
            style={{ minHeight: 28 }}
          />
          {isRunning ? (
            <button
              onClick={() => { ipc.invoke?.('team:stop-run', activeRun!.id); setSending(false) }}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-signal-red/20 border border-signal-red/30 text-signal-red flex-shrink-0 hover:bg-signal-red/30 transition-colors"
            >
              <Square size={11}/>
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-void-500 hover:bg-void-400 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              {sending ? <Loader size={11} className="animate-spin text-white"/> : <Send size={11} className="text-white"/>}
            </button>
          )}
        </div>
        {activeRun?.error && (
          <p className="text-xs text-signal-red mt-1 px-1 font-mono">{activeRun.error}</p>
        )}
      </div>
    </div>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: TeamMessage }) {
  const [showRaw,    setShowRaw]    = useState(false)
  const [showDiff,   setShowDiff]   = useState(false)
  const [showDecision,setShowDecision] = useState(false)
  const isUser = message.role === 'user'

  // For non-user messages try to extract the human-readable part
  let display = message.content
  if (!isUser && message.role !== 'leader') {
    try {
      const obj = JSON.parse(
        message.content.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim()
      )
      // Extract a summary field if present
      display = obj.implementation?.summary
        ?? obj.requirements?.summary
        ?? obj.qa_report?.recommendation
        ?? message.content
    } catch {
        //
    }
  }

  // For leader: show answer or reasoning
  if (message.role === 'leader' && message.leaderDecision) {
    const d = message.leaderDecision
    if (d.nextAction === 'answer' && d.answer) {
      display = d.answer
    } else if (['analyst','developer','qa'].includes(d.nextAction)) {
      display = `→ Delegating to **${d.nextAction}**: ${d.instruction?.slice(0, 120) ?? ''}`
    } else if (d.nextAction === 'done') {
      display = d.reasoning
    }
  }

  return (
    <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="group">
      {isUser ? (
        <div className="flex justify-end">
          <div className="max-w-xl bg-void-500/15 border border-void-500/20 rounded-xl rounded-tr-sm px-3 py-2">
            <p className="text-xs text-carbon-100 font-mono whitespace-pre-wrap selectable">{message.content}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Role label */}
          <div className="flex items-center gap-1.5 text-xs">
            <Bot size={10} className={ROLE_COLOR[message.role]}/>
            <span className={`font-semibold ${ROLE_COLOR[message.role]}`}>
              {message.role.charAt(0).toUpperCase() + message.role.slice(1)}
            </span>
            {message.leaderDecision && (
              <span className="text-carbon-600 font-mono">
                [{message.leaderDecision.nextAction}]
              </span>
            )}
            <span className="text-carbon-700 ml-auto">{new Date(message.timestamp).toLocaleTimeString()}</span>
          </div>

          {/* Main content */}
          <div className={`border rounded-xl rounded-tl-sm px-3 py-2 ${ROLE_BG[message.role]}`}>
            <p className="text-xs text-carbon-200 leading-relaxed whitespace-pre-wrap selectable">{display}</p>

            {/* Leader decision detail */}
            {message.leaderDecision && message.leaderDecision.reasoning && (
              <button
                onClick={() => setShowDecision(v => !v)}
                className="flex items-center gap-1 mt-1.5 text-xs text-carbon-600 hover:text-carbon-400 transition-colors"
              >
                <Eye size={9}/> {showDecision ? 'Hide' : 'Show'} reasoning
              </button>
            )}
            {showDecision && message.leaderDecision && (
              <div className="mt-1.5 text-xs text-carbon-500 font-mono bg-carbon-950 rounded p-2 selectable">
                {message.leaderDecision.reasoning}
              </div>
            )}

            {/* Developer: show file diff */}
            {message.fileDiff && message.fileDiff.filesChanged.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowDiff(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-plasma-400 hover:text-plasma-300 transition-colors"
                >
                  <GitCompare size={10}/>
                  {message.fileDiff.filesChanged.length} file{message.fileDiff.filesChanged.length !== 1 ? 's' : ''} changed
                  (+{message.fileDiff.additions} -{message.fileDiff.deletions})
                  {showDiff ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
                </button>
                <AnimatePresence>
                  {showDiff && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                      <DiffView diff={message.fileDiff}/>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Raw JSON toggle */}
            {!isUser && (
              <button
                onClick={() => setShowRaw(v => !v)}
                className="flex items-center gap-1 mt-1.5 text-xs text-carbon-700 hover:text-carbon-500 transition-colors"
              >
                {showRaw ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
                Raw output
              </button>
            )}
            {showRaw && (
              <pre className="mt-1.5 text-xs font-mono text-carbon-500 whitespace-pre-wrap selectable max-h-48 overflow-y-auto bg-carbon-975 rounded p-2">
                {message.content}
              </pre>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ─── Streaming bubble ─────────────────────────────────────────────────────
function StreamingBubble({ role, buffer }: { role: TeamRole; buffer: string }) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs">
        <Loader size={10} className={`animate-spin ${ROLE_COLOR[role]}`}/>
        <span className={`font-semibold ${ROLE_COLOR[role]}`}>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
      </div>
      <div className={`border rounded-xl rounded-tl-sm px-3 py-2 ${ROLE_BG[role]}`}>
        <p className="text-xs text-carbon-300 font-mono whitespace-pre-wrap selectable">
          {buffer}
          <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse"/>
        </p>
      </div>
    </motion.div>
  )
}

// ─── Diff view ────────────────────────────────────────────────────────────
function DiffView({ diff }: { diff: FileDiffSummary }) {
  const lines = diff.rawDiff.split('\n')
  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-carbon-800 max-h-64 overflow-y-auto">
      <div className="px-3 py-1.5 bg-carbon-950 border-b border-carbon-800 text-xs text-carbon-500 flex gap-3">
        {diff.filesChanged.map(f => <span key={f} className="font-mono truncate">{f}</span>)}
      </div>
      <pre className="p-2 text-xs font-mono bg-carbon-975 selectable overflow-x-auto">
        {lines.map((line, i) => (
          <span
            key={i}
            className={
              line.startsWith('+') && !line.startsWith('+++') ? 'text-signal-green block' :
              line.startsWith('-') && !line.startsWith('---') ? 'text-signal-red block' :
              line.startsWith('@@') ? 'text-void-400 block' :
              'text-carbon-500 block'
            }
          >
            {line}
          </span>
        ))}
      </pre>
    </div>
  )
}

// ─── Context file picker ──────────────────────────────────────────────────
function ContextFilePicker({ team, selected, onChange, onClose }: {
  team: TeamConfig; selected: string[]
  onChange: (files: string[]) => void; onClose: () => void
}) {
  const [tree,    setTree]    = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ipc.invoke?.('ws:tree', { workspaceId: team.workspaceId, maxDepth: 4 })
      .then(t => { setTree(t as FileNode[]); setLoading(false) })
      .catch(() => setLoading(false))
  }, [team.workspaceId])

  const toggle = (path: string) => {
    onChange(selected.includes(path) ? selected.filter(p => p !== path) : [...selected, path])
  }

  return (
    <div className="bg-carbon-950 max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-carbon-900 sticky top-0 bg-carbon-950">
        <span className="text-xs text-carbon-400 font-semibold">Select context files</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onChange([])} className="text-xs text-carbon-600 hover:text-carbon-400">Clear</button>
          <button onClick={onClose} className="text-carbon-600 hover:text-carbon-300"><X size={12}/></button>
        </div>
      </div>
      {loading ? (
        <div className="p-4 text-center text-xs text-carbon-600"><Loader size={14} className="animate-spin mx-auto"/></div>
      ) : (
        <div className="p-2">
          {tree.map(node => (
            <FilePickerNode key={node.path} node={node} depth={0} selected={selected} onToggle={toggle}/>
          ))}
        </div>
      )}
    </div>
  )
}

function FilePickerNode({ node, depth, selected, onToggle }: {
  node: FileNode; depth: number; selected: string[]
  onToggle: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  const isSelected = selected.includes(node.path)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 w-full text-xs text-carbon-500 hover:text-carbon-300 py-0.5 transition-colors"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          {open ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
          <Folder size={10} className="text-signal-yellow/60"/>
          <span>{node.name}</span>
        </button>
        {open && node.children?.map(c => (
          <FilePickerNode key={c.path} node={c} depth={depth+1} selected={selected} onToggle={onToggle}/>
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onToggle(node.path)}
      className={`flex items-center gap-1.5 w-full text-xs py-0.5 transition-colors ${isSelected ? 'text-void-300' : 'text-carbon-600 hover:text-carbon-300'}`}
      style={{ paddingLeft: depth * 12 + 16 }}
    >
      {isSelected ? <Check size={9} className="text-void-400"/> : <span className="w-2.5"/>}
      <FileCode size={9}/>
      <span className="font-mono truncate">{node.name}</span>
    </button>
  )
}

// ─── History tab ──────────────────────────────────────────────────────────
function HistoryTab({ team }: { team: TeamConfig }) {
  const [runs, setRuns] = useState<TeamRun[]>([])

  useEffect(() => {
    ipc.invoke?.('team:list-runs', team.id)
      .then(d => setRuns((d ?? []) as TeamRun[]))
      .catch(console.error)
  }, [team.id])

  if (runs.length === 0) return (
    <div className="flex flex-col items-center justify-center flex-1 text-carbon-600 py-12">
      <History size={24} className="mb-2 opacity-30"/>
      <p className="text-sm">No runs yet</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      <div className="flex items-center justify-between px-1 mb-1">
        <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide">{runs.length} runs</p>
        <button
          onClick={async () => { await ipc.invoke?.('team:clear-history', team.id); setRuns([]) }}
          className="text-xs text-carbon-700 hover:text-signal-red transition-colors flex items-center gap-1"
        >
          <Trash2 size={10}/> Clear
        </button>
      </div>
      {runs.map(r => <HistoryRunCard key={r.id} run={r}/>)}
    </div>
  )
}

function HistoryRunCard({ run }: { run: TeamRun }) {
  const [open, setOpen] = useState(false)
  const icon = run.status === 'done'
    ? <CheckCircle2 size={11} className="text-signal-green flex-shrink-0"/>
    : run.status === 'max_steps'
    ? <AlertTriangle size={11} className="text-signal-yellow flex-shrink-0"/>
    : <XCircle size={11} className="text-signal-red flex-shrink-0"/>

  return (
    <div className="border border-carbon-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-carbon-925 text-xs transition-colors"
      >
        {icon}
        <span className="text-carbon-300 flex-1 text-left truncate">{run.userMessage}</span>
        <span className="text-carbon-600 font-mono flex-shrink-0">{run.steps} steps</span>
        <span className="text-carbon-700 flex-shrink-0 ml-1">{new Date(run.startedAt).toLocaleDateString()}</span>
        {open ? <ChevronDown size={10} className="text-carbon-700"/> : <ChevronRight size={10} className="text-carbon-700"/>}
      </button>
      {open && (
        <div className="border-t border-carbon-900 p-3 space-y-2 max-h-96 overflow-y-auto">
          {run.messages.map(m => <MessageBubble key={m.id} message={m}/>)}
        </div>
      )}
    </div>
  )
}

// ─── Files tab ────────────────────────────────────────────────────────────
function FilesTab({ team, workspaces }: { team: TeamConfig; workspaces: Array<{id:string;name:string;path?:string}> }) {
  const [tree,       setTree]       = useState<FileNode[]>([])
  const [openFile,   setOpenFile]   = useState<string | null>(null)
  const [content,    setContent]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [loadingFile,setLoadingFile] = useState(false)
  const [searchQ,    setSearchQ]    = useState('')
  const [searchRes,  setSearchRes]  = useState<Array<{path:string;line:number;content:string}>>([])
  const [searching,  setSearching]  = useState(false)

  const ws = workspaces.find(w => w.id === team.workspaceId)

  const loadTree = useCallback(async () => {
    setLoading(true)
    const t = await ipc.invoke?.('ws:tree', { workspaceId: team.workspaceId, maxDepth: 5 })
      .catch(() => []) as FileNode[]
    setTree(t); setLoading(false)
  }, [team.workspaceId])

  useEffect(() => { loadTree() }, [loadTree])

  const openFileHandler = async (relPath: string) => {
    setLoadingFile(true); setOpenFile(relPath)
    const c = await ipc.invoke?.('ws:read-file', { workspaceId: team.workspaceId, relPath })
      .catch(() => '// Error reading file') as string
    setContent(c); setLoadingFile(false)
  }

  const doSearch = async () => {
    if (!searchQ.trim()) return
    setSearching(true)
    const r = await ipc.invoke?.('ws:search-files', { workspaceId: team.workspaceId, pattern: searchQ })
      .catch(() => []) as typeof searchRes
    setSearchRes(r); setSearching(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Tree sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-carbon-900 flex flex-col">
        <div className="panel-header justify-between py-1.5 px-3 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs"><FolderOpen size={11}/> {ws?.name ?? 'Workspace'}</span>
          <button onClick={loadTree} className="text-carbon-600 hover:text-carbon-300">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
        {/* Search */}
        <div className="px-2 py-1.5 border-b border-carbon-900 flex gap-1">
          <input
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search…" className="flex-1 text-xs bg-carbon-950 border border-carbon-800 rounded px-2 py-1 text-carbon-200 outline-none placeholder-carbon-700 selectable"
          />
          <button onClick={doSearch} className="text-carbon-600 hover:text-carbon-300">
            {searching ? <Loader size={11} className="animate-spin"/> : <Search size={11}/>}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {searchRes.length > 0 ? (
            <div className="px-2 space-y-0.5">
              <div className="flex items-center justify-between text-xs text-carbon-600 px-1 py-0.5">
                <span>{searchRes.length} results</span>
                <button onClick={() => setSearchRes([])} className="hover:text-carbon-400"><X size={10}/></button>
              </div>
              {searchRes.map((r, i) => (
                <button key={i} onClick={() => openFileHandler(r.path)}
                  className="w-full text-left px-1 py-0.5 hover:bg-carbon-900 rounded transition-colors">
                  <div className="text-xs font-mono text-carbon-400 truncate">{r.path}:{r.line}</div>
                  <div className="text-xs text-carbon-600 truncate">{r.content}</div>
                </button>
              ))}
            </div>
          ) : (
            tree.map(node => (
              <TreeNode key={node.path} node={node} depth={0}
                onOpen={openFileHandler} active={openFile ?? ''}/>
            ))
          )}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {openFile ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-carbon-900 text-xs bg-carbon-950 flex-shrink-0">
              <FileCode size={11} className="text-void-400"/>
              <span className="text-carbon-300 font-mono">{openFile}</span>
              <button onClick={() => setOpenFile(null)} className="ml-auto text-carbon-700 hover:text-carbon-400">
                <X size={11}/>
              </button>
            </div>
            {loadingFile ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader size={16} className="animate-spin text-carbon-600"/>
              </div>
            ) : (
              <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-carbon-300 bg-carbon-975 selectable whitespace-pre-wrap">
                {content}
              </pre>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-carbon-700 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  )
}

function TreeNode({ node, depth, onOpen, active }: {
  node: FileNode; depth: number; onOpen: (p: string) => void; active: string
}) {
  const [open, setOpen] = useState(depth < 1)
  const isActive = node.path === active

  if (node.type === 'directory') return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 w-full py-0.5 text-xs text-carbon-500 hover:text-carbon-300 transition-colors"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {open ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
        {open ? <FolderOpen size={10} className="text-signal-yellow/60"/> : <Folder size={10} className="text-signal-yellow/60"/>}
        <span>{node.name}</span>
      </button>
      {open && node.children?.map(c => (
        <TreeNode key={c.path} node={c} depth={depth+1} onOpen={onOpen} active={active}/>
      ))}
    </div>
  )

  return (
    <button
      onClick={() => onOpen(node.path)}
      className={`flex items-center gap-1.5 w-full py-0.5 text-xs transition-colors ${isActive ? 'bg-void-500/15 text-white' : 'text-carbon-600 hover:text-carbon-400'}`}
      style={{ paddingLeft: 20 + depth * 12 }}
    >
      <FileCode size={9} className={isActive ? 'text-void-400' : 'text-carbon-700'}/>
      <span className="font-mono truncate">{node.name}</span>
    </button>
  )
}

// ─── Settings tab ─────────────────────────────────────────────────────────
function SettingsTab({ team, onUpdated, onDelete }: {
  team: TeamConfig
  onUpdated: (t: TeamConfig) => void
  onDelete: () => void
}) {
  const [name,      setName]      = useState(team.name)
  const [maxSteps,  setMaxSteps]  = useState(team.maxSteps)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [confirmDel,setConfirmDel]= useState(false)

  const save = async () => {
    setSaving(true)
    await ipc.invoke?.('team:update', { id: team.id, patch: { name, maxSteps } })
    onUpdated({ ...team, name, maxSteps })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Basic settings */}
      <div className="space-y-3">
        <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide">Team Settings</p>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="selectable w-full text-xs bg-carbon-950 border border-carbon-800 rounded-lg px-3 py-2 text-white outline-none focus:border-void-500"/>
        </div>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Max steps: {maxSteps}</label>
          <p className="text-xs text-carbon-700 mb-1.5">Maximum leader→agent cycles per task</p>
          <input type="range" min={4} max={24} value={maxSteps}
            onChange={e => setMaxSteps(Number(e.target.value))} className="w-full accent-void-500"/>
        </div>
        <button onClick={save} disabled={saving}
          className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${
            saved ? 'bg-signal-green/20 border border-signal-green/30 text-signal-green'
                  : 'bg-void-500 hover:bg-void-400 text-white'
          } disabled:opacity-50`}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Members list */}
      <div className="space-y-2">
        <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide">Team Members</p>
        {team.members.map(m => (
          <div key={m.agentId} className="flex items-center gap-2 bg-carbon-950 border border-carbon-900 rounded-lg px-3 py-2">
            <Bot size={11} className={ROLE_COLOR[m.role]}/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-carbon-200">{m.name}</div>
              <div className="text-xs text-carbon-600 font-mono">{m.provider} · {m.model}</div>
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${ROLE_COLOR[m.role]}`}>{m.role}</span>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="border border-signal-red/20 rounded-xl p-3 space-y-2">
        <p className="text-xs text-signal-red font-semibold uppercase tracking-wide">Danger Zone</p>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)}
            className="w-full py-1.5 bg-signal-red/10 border border-signal-red/20 text-signal-red rounded-lg text-xs hover:bg-signal-red/20 transition-colors flex items-center justify-center gap-1">
            <Trash2 size={10}/> Delete Team
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-carbon-400">This will delete the team and all run history.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(false)}
                className="flex-1 py-1.5 border border-carbon-700 text-carbon-500 rounded text-xs hover:text-white transition-colors">Cancel</button>
              <button onClick={async () => { await ipc.invoke?.('team:delete', team.id); onDelete() }}
                className="flex-1 py-1.5 bg-signal-red text-white rounded text-xs font-medium hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Create team view ─────────────────────────────────────────────────────
function CreateTeamView({ workspaces, sessionId, onCreated, onBack }: {
  workspaces: Array<{id:string;name:string}>; sessionId: string
  onCreated: (t: TeamConfig) => void; onBack: () => void
}) {
  const [name,      setName]      = useState('Dev Team')
  const [wsId,      setWsId]      = useState(workspaces[0]?.id ?? '')
  const [provider,  setProvider]  = useState('anthropic')
  const [model,     setModel]     = useState('claude-sonnet-4-5')
  const [leaderMdl, setLeaderMdl] = useState('claude-opus-4-5')
  const [maxSteps,  setMaxSteps]  = useState(12)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const prov = PROVIDERS.find(p => p.id === provider)!

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId) { setError('Select a workspace'); return }
    setLoading(true); setError('')
    try {
      const team = await ipc.invoke?.('team:create-agents', {
        name, workspaceId: wsId, sessionId, provider,
        model, leaderModel: leaderMdl, maxSteps,
      }) as TeamConfig
      onCreated(team)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header px-4 gap-2">
        <button onClick={onBack} className="text-carbon-500 hover:text-white transition-colors">
          <ChevronLeft size={14}/>
        </button>
        <span>New Team</span>
      </div>
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-carbon-950 border border-carbon-900 rounded-xl p-3 text-xs text-carbon-500 leading-relaxed space-y-1">
          <p className="text-carbon-300 font-medium">Leader-centric orchestration</p>
          <p>The Team Leader receives every message first and decides whether to answer directly or delegate to the Analyst, Developer, or QA Engineer. Simple questions get instant answers. Complex tasks get the right specialists.</p>
        </div>

        <div>
          <label className="text-xs text-carbon-500 block mb-1">Team name</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className="selectable w-full text-xs bg-carbon-950 border border-carbon-800 rounded-lg px-3 py-2 text-white outline-none focus:border-void-500"/>
        </div>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Workspace</label>
          <select value={wsId} onChange={e => setWsId(e.target.value)}
            className="w-full text-xs bg-carbon-950 border border-carbon-800 rounded-lg px-3 py-2 text-carbon-200 outline-none focus:border-void-500">
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-carbon-500 block mb-1">Provider</label>
            <select value={provider} onChange={e => {
              const p = PROVIDERS.find(x => x.id === e.target.value)!
              setProvider(p.id); setModel(p.models[1] ?? p.models[0]); setLeaderMdl(p.models[0])
            }} className="w-full text-xs bg-carbon-950 border border-carbon-800 rounded-lg px-2 py-2 text-carbon-200 outline-none focus:border-void-500">
              {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-carbon-500 block mb-1">Agents model</label>
            <select value={model} onChange={e => setModel(e.target.value)}
              className="w-full text-xs bg-carbon-950 border border-carbon-800 rounded-lg px-2 py-2 text-carbon-200 outline-none focus:border-void-500">
              {prov.models.map(m => <option key={m} value={m}>{m.split(':')[0].split('-').slice(-2).join('-')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-carbon-500 block mb-1">Leader model</label>
            <select value={leaderMdl} onChange={e => setLeaderMdl(e.target.value)}
              className="w-full text-xs bg-carbon-950 border border-carbon-800 rounded-lg px-2 py-2 text-carbon-200 outline-none focus:border-void-500">
              {prov.models.map(m => <option key={m} value={m}>{m.split(':')[0].split('-').slice(-2).join('-')}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Max steps: {maxSteps}</label>
          <p className="text-xs text-carbon-700 mb-1.5">Max leader→agent cycles. 12 is plenty for most tasks.</p>
          <input type="range" min={4} max={24} value={maxSteps}
            onChange={e => setMaxSteps(Number(e.target.value))} className="w-full accent-void-500"/>
        </div>
        {error && <p className="text-xs text-signal-red">{error}</p>}
        <button type="submit" disabled={loading || !wsId}
          className="w-full py-2.5 bg-void-500 hover:bg-void-400 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader size={12} className="animate-spin"/> Creating team…</> : <><Users size={12}/> Create Team</>}
        </button>
      </form>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyNoTeam({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
      <Users size={32} className="text-carbon-700 mb-3"/>
      <p className="text-sm font-medium text-carbon-400 mb-1">No teams yet</p>
      <p className="text-xs text-carbon-600 mb-4">Create a team to get started with leader-centric agent orchestration</p>
      <button onClick={onCreate}
        className="flex items-center gap-1.5 px-4 py-2 bg-void-500 hover:bg-void-400 text-white rounded-xl text-sm font-medium transition-colors">
        <Plus size={12}/> Create Team
      </button>
    </div>
  )
}
