import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import {
  Users, Play, Square, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronRight, Bot, Database,
  Loader, Plus, Trash2, Bug,
} from 'lucide-react'

type TeamRole = 'leader' | 'analyst' | 'developer' | 'qa'
type TeamRunStatus =
  | 'idle' | 'planning' | 'analyzing' | 'developing'
  | 'reviewing' | 'done' | 'error' | 'max_retries'

interface TeamMember { role: TeamRole; name: string; agentId: string; model: string; provider: string }
interface TeamConfig  { id: string; name: string; workspaceId: string; sessionId: string; members: TeamMember[]; maxRetries: number; createdAt: string; updatedAt: string }
interface ParsedDefect { id: string; severity: 'critical'|'major'|'minor'; description: string; file?: string; line?: number }
interface TeamCycleRecord { cycle: number; leaderPlan: string; analystOutput: string; devOutput: string; qaOutput: string; qaPassed: boolean; defects: ParsedDefect[]; timestamp: string }
interface TeamRun { id: string; teamId: string; task: string; status: TeamRunStatus; cycle: number; maxRetries: number; startedAt: string; endedAt?: string; error?: string; history: TeamCycleRecord[]; lastQaOutput?: string; qaPassedAt?: number }
interface IndexStats { totalFiles: number; totalChunks: number; provider: string; indexedAt: string }

// ─── Constants ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<TeamRunStatus, string> = {
  idle: 'Idle', planning: 'Leader planning…', analyzing: 'Analyst working…',
  developing: 'Developer coding…', reviewing: 'QA reviewing…',
  done: 'Done ✓', error: 'Error', max_retries: 'Max retries reached',
}

const ROLE_COLOR: Record<TeamRole, string> = {
  leader:    'bg-void-500/20 text-void-300 border-void-500/30',
  analyst:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  developer: 'bg-plasma-500/15 text-plasma-300 border-plasma-500/30',
  qa:        'bg-signal-green/15 text-signal-green border-signal-green/30',
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'] },
  { id: 'openai',    label: 'OpenAI',    models: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'ollama',    label: 'Ollama',    models: ['codellama:latest', 'llama3.1:8b', 'kimi-k2:latest', 'deepseek-r1:1.5b', 'qwen2.5-coder:1.5b-instruct', 'mistral:latest', 'phi4:14b-q4_K_M'] },
]

// ─── Main panel ───────────────────────────────────────────────────────────
export function TeamPanel() {
  const { workspaces, ui } = useStore()
  const [teams,      setTeams]      = useState<TeamConfig[]>([])
  const [activeTeam, setActiveTeam] = useState<TeamConfig | null>(null)
  const [activeRun,  setActiveRun]  = useState<TeamRun | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [idxStats,   setIdxStats]   = useState<Record<string, IndexStats>>({})

  const loadTeams = useCallback(async () => {
    const list = await ipc.invoke?.('team:list', {}) as TeamConfig[] | undefined
    setTeams(list ?? [])
    if (list?.length && !activeTeam) setActiveTeam(list[0])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTeams() }, [loadTeams])

  // Listen for live events from main process
  useEffect(() => {
    const subs: Array<() => void> = []
    const on = (ch: string, cb: (d: unknown) => void) => {
      const u = ipc.on?.(`team:${ch}`, cb)
      if (u) subs.push(u)
    }
    on('run-start',  d => setActiveRun(d as TeamRun))
    on('run-status', d => {
      const { runId, status } = d as { runId: string; status: TeamRunStatus }
      setActiveRun(prev => prev?.id === runId ? { ...prev, status } : prev)
    })
    on('run-cycle', d => {
      const { runId, cycle } = d as { runId: string; cycle: number }
      setActiveRun(prev => prev?.id === runId ? { ...prev, cycle } : prev)
    })
    on('run-cycle-complete', async d => {
      const { runId } = d as { runId: string }
      // Fetch full run to get updated history
      const updated = await ipc.invoke?.('team:get-run', runId) as TeamRun | undefined
      if (updated) setActiveRun(updated)
    })
    on('run-end', async d => {
      const run = d as TeamRun
      const updated = await ipc.invoke?.('team:get-run', run.id) as TeamRun | undefined
      setActiveRun(updated ?? run)
    })
    on('context-index-done', d => {
      const s = d as IndexStats & { workspaceId: string }
      setIdxStats(prev => ({ ...prev, [s.workspaceId]: s }))
    })
    return () => subs.forEach(u => u())
  }, [])

  const loadStats = useCallback(async (wsId: string) => {
    const s = await ipc.invoke?.('context:stats', wsId) as IndexStats | undefined
    if (s) setIdxStats(prev => ({ ...prev, [wsId]: s }))
  }, [])

  useEffect(() => {
    if (activeTeam) loadStats(activeTeam.workspaceId)
  }, [activeTeam, loadStats])

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header justify-between px-4">
        <span className="flex items-center gap-2"><Users size={13} className="text-void-400"/>Agent Teams</span>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1 text-xs bg-void-500/20 hover:bg-void-500/30 border border-void-500/30 text-void-300 px-2 py-1 rounded-lg transition-colors"
        >
          <Plus size={11}/> New Team
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
            <CreateForm
              workspaces={workspaces}
              sessionId={ui.selectedSessionId ?? 'default'}
              onCreated={t => { setTeams(prev => [t, ...prev]); setActiveTeam(t); setShowCreate(false) }}
              onCancel={() => setShowCreate(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-carbon-900 overflow-y-auto">
          {teams.length === 0 ? (
            <div className="text-center py-10 px-3">
              <Users size={24} className="mx-auto mb-2 text-carbon-700"/>
              <p className="text-xs text-carbon-500">No teams yet</p>
            </div>
          ) : teams.map(t => (
            <TeamRow
              key={t.id}
              team={t}
              active={activeTeam?.id === t.id}
              onSelect={() => setActiveTeam(t)}
              onDelete={async () => {
                await ipc.invoke?.('team:delete', t.id)
                const next = teams.filter(x => x.id !== t.id)
                setTeams(next)
                if (activeTeam?.id === t.id) setActiveTeam(next[0] ?? null)
              }}
            />
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTeam
            ? <TeamDetail
                team={activeTeam}
                run={activeRun?.teamId === activeTeam.id ? activeRun : null}
                idxStats={idxStats[activeTeam.workspaceId]}
                onRunStart={r => setActiveRun(r)}
                onReindex={async () => {
                  await ipc.invoke?.('context:index', { workspaceId: activeTeam.workspaceId })
                  await loadStats(activeTeam.workspaceId)
                }}
              />
            : <Empty/>}
        </div>
      </div>
    </div>
  )
}

// ─── Team sidebar row ─────────────────────────────────────────────────────
function TeamRow({ team, active, onSelect, onDelete }: {
  team: TeamConfig; active: boolean; onSelect: () => void; onDelete: () => void
}) {
  const [h, setH] = useState(false)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors mx-1 my-0.5 rounded-lg ${active ? 'bg-carbon-850 border border-void-500/20' : 'hover:bg-carbon-925'}`}
    >
      <Users size={11} className="text-void-400 flex-shrink-0"/>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-carbon-200 truncate">{team.name}</div>
        <div className="text-xs text-carbon-600 font-mono">{team.members.length} agents · {team.maxRetries} retries</div>
      </div>
      {(h || active) && (
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="text-carbon-700 hover:text-signal-red transition-colors">
          <Trash2 size={10}/>
        </button>
      )}
    </div>
  )
}

// ─── Team detail ─────────────────────────────────────────────────────────
function TeamDetail({ team, run, idxStats, onRunStart, onReindex }: {
  team: TeamConfig; run: TeamRun | null
  idxStats?: IndexStats; onRunStart: (r: TeamRun) => void; onReindex: () => void
}) {
  const [task,      setTask]      = useState('')
  const [starting,  setStarting]  = useState(false)
  const [pastRuns,  setPastRuns]  = useState<TeamRun[]>([])
  const [reindexing,setReindexing]= useState(false)

  useEffect(() => {
    ipc.invoke?.('team:list-runs', team.id)
      .then(d => setPastRuns((d ?? []) as TeamRun[]))
      .catch(console.error)
  }, [team.id, run?.status])

  const isRunning = run && !['done','error','max_retries','idle'].includes(run.status)

  const start = async () => {
    if (!task.trim() || starting) return
    setStarting(true)
    try {
      const r = await ipc.invoke?.('team:run', { teamId: team.id, task: task.trim() }) as TeamRun
      onRunStart(r); setTask('')
    } catch (e) { console.error(e) }
    finally { setStarting(false) }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-carbon-900 flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">{team.name}</p>
          <p className="text-xs text-carbon-500 font-mono">max {team.maxRetries} retries</p>
        </div>
        <div className="flex items-center gap-2">
          {idxStats
            ? <span className="text-xs text-carbon-500 font-mono flex items-center gap-1">
                <Database size={10} className="text-signal-green"/>{idxStats.totalFiles} files · {idxStats.provider}
              </span>
            : <span className="text-xs text-carbon-700">not indexed</span>}
          <button
            onClick={async () => { setReindexing(true); await onReindex(); setReindexing(false) }}
            disabled={reindexing}
            className="text-carbon-600 hover:text-carbon-300 transition-colors"
            title="Re-index workspace"
          >
            <RefreshCw size={11} className={reindexing ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-carbon-900 overflow-x-auto flex-shrink-0">
        {team.members.map(m => (
          <div key={m.agentId} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs flex-shrink-0 ${ROLE_COLOR[m.role]}`}>
            <Bot size={9}/> <span className="font-medium capitalize">{m.role}</span>
            <span className="opacity-50 font-mono">{m.model.split('-').slice(-2).join('-')}</span>
          </div>
        ))}
      </div>

      {/* Task input */}
      <div className="px-4 py-3 border-b border-carbon-900 flex-shrink-0">
        <p className="text-xs text-carbon-500 mb-2 font-semibold uppercase tracking-wide">Task for the team</p>
        <textarea
          value={task} onChange={e => setTask(e.target.value)} rows={3}
          placeholder="Describe what the team should build or fix…"
          className="selectable w-full bg-carbon-950 border border-carbon-800 focus:border-void-500 rounded-lg px-3 py-2 text-xs text-carbon-100 placeholder-carbon-600 outline-none resize-none transition-colors font-mono"
        />
        <div className="flex gap-2 mt-2">
          {isRunning
            ? <button onClick={() => ipc.invoke?.('team:stop-run', run!.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-signal-red/20 border border-signal-red/30 text-signal-red rounded-lg text-xs font-medium hover:bg-signal-red/30 transition-colors">
                <Square size={10}/> Stop
              </button>
            : <button onClick={start} disabled={!task.trim() || starting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-void-500 hover:bg-void-400 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
                {starting ? <Loader size={10} className="animate-spin"/> : <Play size={10}/>}
                {starting ? 'Starting…' : 'Run Team'}
              </button>}
        </div>
      </div>

      {/* Console or history */}
      <div className="flex-1 overflow-y-auto">
        {run
          ? <RunConsole run={run}/>
          : pastRuns.length > 0
            ? <div className="p-3 space-y-2">
                <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide px-1 mb-2">Past Runs</p>
                {pastRuns.map(r => <PastRunRow key={r.id} run={r}/>)}
              </div>
            : <Empty msg="Submit a task above to start the team"/>}
      </div>
    </div>
  )
}

// ─── Run console ─────────────────────────────────────────────────────────
function RunConsole({ run }: { run: TeamRun }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set([run.cycle]))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setExpanded(prev => new Set([...prev, run.cycle]))
  }, [run.history.length, run.status])

  const isTerminal = ['done','error','max_retries'].includes(run.status)
  const statusColor = run.status === 'done' ? 'text-signal-green'
    : ['error','max_retries'].includes(run.status) ? 'text-signal-red'
    : 'text-carbon-400'

  return (
    <div className="p-3 space-y-3">
      {/* Status bar */}
      <div className={`flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded-lg bg-carbon-950 border border-carbon-800 ${statusColor}`}>
        {run.status === 'done'
          ? <CheckCircle2 size={12}/>
          : ['error','max_retries'].includes(run.status)
          ? <XCircle size={12}/>
          : <Loader size={12} className="animate-spin"/>}
        {STATUS_LABEL[run.status]}
        <span className="text-carbon-600 ml-1">· cycle {run.cycle}/{run.maxRetries}</span>
        {run.qaPassedAt && <span className="ml-auto text-signal-green text-xs">QA passed cycle {run.qaPassedAt}</span>}
      </div>

      {/* Task */}
      <div className="bg-carbon-950 border border-carbon-900 rounded-lg px-3 py-2">
        <p className="text-xs text-carbon-500 mb-0.5 font-semibold uppercase tracking-wide">Task</p>
        <p className="text-xs text-carbon-200 font-mono selectable">{run.task}</p>
      </div>

      {/* Cycles */}
      {run.history.map(c => (
        <CycleCard
          key={c.cycle}
          record={c}
          open={expanded.has(c.cycle)}
          onToggle={() => setExpanded(prev => {
            const n = new Set(prev); n.has(c.cycle) ? n.delete(c.cycle) : n.add(c.cycle); return n
          })}
        />
      ))}

      {/* In-progress indicator */}
      {!isTerminal && (
        <div className="flex items-center gap-2 text-xs text-carbon-500 px-2">
          <Loader size={10} className="animate-spin"/>
          {STATUS_LABEL[run.status]}
        </div>
      )}

      {/* Error */}
      {run.error && (
        <div className="bg-signal-red/10 border border-signal-red/20 rounded-lg px-3 py-2 text-xs text-signal-red font-mono whitespace-pre-wrap selectable">
          {run.error}
        </div>
      )}

      <div ref={bottomRef}/>
    </div>
  )
}

// ─── Cycle card ───────────────────────────────────────────────────────────
function CycleCard({ record, open, onToggle }: {
  record: TeamCycleRecord; open: boolean; onToggle: () => void
}) {
  return (
    <div className={`border rounded-xl overflow-hidden ${record.qaPassed ? 'border-signal-green/20' : 'border-signal-red/20'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-carbon-925 transition-colors">
        {record.qaPassed
          ? <CheckCircle2 size={12} className="text-signal-green flex-shrink-0"/>
          : <XCircle size={12} className="text-signal-red flex-shrink-0"/>}
        <span className="font-semibold text-carbon-200">Cycle {record.cycle}</span>
        {!record.qaPassed && record.defects.length > 0 && (
          <span className="flex items-center gap-1 text-signal-yellow ml-1">
            <Bug size={9}/> {record.defects.length}
          </span>
        )}
        <span className="text-carbon-600 ml-auto text-xs">{new Date(record.timestamp).toLocaleTimeString()}</span>
        {open ? <ChevronDown size={10} className="text-carbon-600"/> : <ChevronRight size={10} className="text-carbon-600"/>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
            <div className="border-t border-carbon-900 p-3 space-y-2">
              <OutputBlock label="Leader Plan"    color="text-void-400"          content={record.leaderPlan}/>
              <OutputBlock label="Requirements"   color="text-blue-400"          content={record.analystOutput}/>
              <OutputBlock label="Implementation" color="text-plasma-400"        content={record.devOutput}/>
              <OutputBlock label="QA Report"      color={record.qaPassed ? 'text-signal-green' : 'text-signal-red'} content={record.qaOutput}/>
              {record.defects.length > 0 && (
                <div className="bg-signal-red/8 border border-signal-red/20 rounded-lg p-2.5 space-y-1">
                  <p className="text-xs text-signal-red font-semibold flex items-center gap-1 mb-1"><Bug size={10}/> Defects</p>
                  {record.defects.map((d, i) => (
                    <div key={i} className="text-xs text-carbon-300 font-mono">
                      <span className={`mr-1 ${d.severity === 'critical' ? 'text-signal-red' : d.severity === 'major' ? 'text-signal-yellow' : 'text-carbon-500'}`}>[{d.severity}]</span>
                      {d.description}
                      {d.file && <span className="text-carbon-600"> · {d.file}{d.line ? `:${d.line}` : ''}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Output block ─────────────────────────────────────────────────────────
function OutputBlock({ label, color, content }: { label: string; color: string; content: string }) {
  const [open, setOpen] = useState(false)
  let pretty = content
  try {
    pretty = JSON.stringify(JSON.parse(content.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim()), null, 2)
  } catch {
    //
  }

  return (
    <div className="border border-carbon-900 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-carbon-925 text-xs transition-colors">
        <span className={`font-semibold ${color}`}>{label}</span>
        {open ? <ChevronDown size={10} className="text-carbon-600"/> : <ChevronRight size={10} className="text-carbon-600"/>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden">
            <pre className="border-t border-carbon-900 px-3 py-2 text-xs font-mono text-carbon-400 whitespace-pre-wrap selectable max-h-64 overflow-y-auto bg-carbon-975">
              {pretty}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Past run row ─────────────────────────────────────────────────────────
function PastRunRow({ run }: { run: TeamRun }) {
  const [open, setOpen] = useState(false)
  const icon = run.status === 'done' ? <CheckCircle2 size={11} className="text-signal-green"/>
    : run.status === 'max_retries' ? <AlertTriangle size={11} className="text-signal-yellow"/>
    : <XCircle size={11} className="text-signal-red"/>
  return (
    <div className="border border-carbon-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-carbon-925 text-xs transition-colors">
        {icon}
        <span className="text-carbon-300 flex-1 text-left truncate">{run.task}</span>
        <span className="text-carbon-600 font-mono flex-shrink-0">{run.cycle} cycle{run.cycle !== 1 ? 's' : ''}</span>
        {open ? <ChevronDown size={10} className="text-carbon-700"/> : <ChevronRight size={10} className="text-carbon-700"/>}
      </button>
      {open && <div className="border-t border-carbon-900"><RunConsole run={run}/></div>}
    </div>
  )
}

// ─── Create form ──────────────────────────────────────────────────────────
function CreateForm({ workspaces, sessionId, onCreated, onCancel }: {
  workspaces: Array<{ id: string; name: string }>
  sessionId: string
  onCreated: (t: TeamConfig) => void
  onCancel: () => void
}) {
  const [name,       setName]       = useState('Dev Team')
  const [wsId,       setWsId]       = useState(workspaces[0]?.id ?? '')
  const [provider,   setProvider]   = useState('anthropic')
  const [model,      setModel]      = useState('claude-sonnet-4-5')
  const [leaderMdl,  setLeaderMdl]  = useState('claude-opus-4-5')
  const [maxRetries, setMaxRetries] = useState(3)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const prov = PROVIDERS.find(p => p.id === provider)!

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId) { setError('Select a workspace'); return }
    setLoading(true); setError('')
    try {
      const team = await ipc.invoke?.('team:create-agents', {
        name, workspaceId: wsId, sessionId, provider,
        model, leaderModel: leaderMdl, maxRetries,
      }) as TeamConfig
      onCreated(team)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="p-4 border-b border-carbon-900 bg-carbon-950 space-y-3">
      <p className="text-xs font-semibold text-carbon-400 uppercase tracking-wide">New Team</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-3 py-2 text-white outline-none focus:border-void-500 selectable"/>
        </div>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Workspace</label>
          <select value={wsId} onChange={e => setWsId(e.target.value)}
            className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-3 py-2 text-carbon-200 outline-none focus:border-void-500">
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Provider</label>
          <select value={provider} onChange={e => {
            const p = PROVIDERS.find(x => x.id === e.target.value)!
            setProvider(p.id); setModel(p.models[1] ?? p.models[0]); setLeaderMdl(p.models[0])
          }} className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-2 py-2 text-carbon-200 outline-none focus:border-void-500">
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Agents</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-2 py-2 text-carbon-200 outline-none focus:border-void-500">
            {prov.models.map(m => <option key={m} value={m}>{m.split(':')[0].split('-').slice(-2).join('-')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-carbon-500 block mb-1">Leader</label>
          <select value={leaderMdl} onChange={e => setLeaderMdl(e.target.value)}
            className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-2 py-2 text-carbon-200 outline-none focus:border-void-500">
            {prov.models.map(m => <option key={m} value={m}>{m.split(':')[0].split('-').slice(-2).join('-')}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-carbon-500 block mb-1">Max retries: {maxRetries}</label>
        <input type="range" min={1} max={5} value={maxRetries}
          onChange={e => setMaxRetries(Number(e.target.value))} className="w-full accent-void-500"/>
      </div>
      {error && <p className="text-xs text-signal-red">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-1.5 border border-carbon-700 text-carbon-500 rounded-lg text-xs hover:text-white transition-colors">Cancel</button>
        <button type="submit" disabled={loading || !wsId}
          className="flex-1 py-1.5 bg-void-500 hover:bg-void-400 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
          {loading ? <><Loader size={10} className="animate-spin"/> Creating…</> : <><Users size={10}/> Create Team</>}
        </button>
      </div>
    </form>
  )
}

// ─── Empty states ─────────────────────────────────────────────────────────
function Empty({ msg }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-carbon-600 py-12">
      <Users size={24} className="mb-2 opacity-30"/>
      <p className="text-sm">{msg ?? 'Select or create a team'}</p>
    </div>
  )
}
