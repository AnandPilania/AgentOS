import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import {
  Plug, PlugZap, Plus, Trash2, CheckCircle2,
  XCircle, Loader, ChevronDown, ChevronRight,
  Globe, Wrench, Database
} from 'lucide-react'
import type { MCPServer, MCPTransport } from '../../../shared/types'

export function MCPPanel() {
  const { mcpServers, upsertMCPServer, removeMCPServer, setMCPServers } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    ipc.invoke?.('mcp:list').then((d: unknown) => setMCPServers((d ?? []) as import('../../../shared/types').MCPServer[])).catch(console.error)
  }, [])

  const connect = async (id: string) => {
    try {
      const updated = await ipc.invoke?.('mcp:connect', id) as MCPServer
      upsertMCPServer(updated)
    } catch (e) { console.error(e) }
  }

  const disconnect = async (id: string) => {
    try {
      await ipc.invoke?.('mcp:disconnect', id)
      upsertMCPServer({ ...mcpServers.find(s => s.id === id)!, status: 'disconnected' })
    } catch (e) { console.error(e) }
  }

  const remove = async (id: string) => {
    await ipc.invoke?.('mcp:remove', id)
    removeMCPServer(id)
  }

  const totalTools = mcpServers.reduce((n, s) => n + s.tools.length, 0)
  const connected  = mcpServers.filter(s => s.status === 'connected').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header justify-between px-4">
        <span className="flex items-center gap-2">
          <PlugZap size={13} className="text-void-400" />
          MCP Servers
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-carbon-500 font-mono">{connected}/{mcpServers.length} connected · {totalTools} tools</span>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1 text-xs bg-void-500/20 hover:bg-void-500/30 border border-void-500/30 text-void-300 px-2 py-1 rounded-lg transition-colors">
            <Plus size={11} /> Add
          </button>
        </div>
      </div>

      {/* Add server form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
            <AddServerForm onAdd={async (data) => {
              const srv = await ipc.invoke?.('mcp:add', data) as MCPServer
              upsertMCPServer(srv)
              setShowAdd(false)
            }} onCancel={() => setShowAdd(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Built-in presets */}
      <div className="px-4 py-3 border-b border-carbon-900">
        <p className="text-xs text-carbon-500 mb-2 font-semibold uppercase tracking-wide">Quick Add</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map(p => (
            <button key={p.name} onClick={async () => {
                const { icon, ...ipcData } = p;
              const srv = await ipc.invoke?.('mcp:add', ipcData) as MCPServer
              upsertMCPServer(srv)
            }} className="flex items-center gap-2 px-2 py-1.5 bg-carbon-950 border border-carbon-800 rounded-lg text-xs text-carbon-400 hover:text-white hover:border-carbon-600 transition-colors">
              {p.icon}
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {mcpServers.length === 0 ? (
          <div className="text-center py-12">
            <Plug size={32} className="mx-auto mb-3 text-carbon-700" />
            <p className="text-sm text-carbon-500">No MCP servers configured</p>
            <p className="text-xs text-carbon-700 mt-1">Add a server to extend agent capabilities</p>
          </div>
        ) : mcpServers.map(srv => (
          <ServerCard
            key={srv.id}
            server={srv}
            expanded={!!expanded[srv.id]}
            onToggle={() => setExpanded(p => ({ ...p, [srv.id]: !p[srv.id] }))}
            onConnect={() => connect(srv.id)}
            onDisconnect={() => disconnect(srv.id)}
            onRemove={() => remove(srv.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── ServerCard ───────────────────────────────────────────
function ServerCard({ server, expanded, onToggle, onConnect, onDisconnect, onRemove }: {
  server: MCPServer; expanded: boolean
  onConnect: () => void; onDisconnect: () => void
  onRemove: () => void; onToggle: () => void
}) {
  const statusIcon = {
    connected:    <CheckCircle2 size={13} className="text-signal-green" />,
    disconnected: <XCircle      size={13} className="text-carbon-600" />,
    connecting:   <Loader       size={13} className="text-signal-yellow animate-spin" />,
    error:        <XCircle      size={13} className="text-signal-red" />,
  }[server.status]

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      server.status === 'connected' ? 'border-signal-green/20 bg-signal-green/5' :
      server.status === 'error'     ? 'border-signal-red/20 bg-signal-red/5'     :
      'border-carbon-800 bg-carbon-950'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {statusIcon}
        <span className="text-xs font-semibold text-carbon-200 flex-1">{server.name}</span>
        <span className="text-xs text-carbon-600 font-mono">{server.transport}</span>
        <span className="text-xs text-carbon-500">{server.tools.length} tools</span>

        {server.status === 'connected' ? (
          <button onClick={onDisconnect} className="text-xs text-carbon-500 hover:text-signal-red transition-colors px-1">Disconnect</button>
        ) : (
          <button onClick={onConnect} className="text-xs text-void-400 hover:text-void-300 transition-colors px-1">Connect</button>
        )}

        <button onClick={onToggle} className="text-carbon-600 hover:text-white transition-colors">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button onClick={onRemove} className="text-carbon-700 hover:text-signal-red transition-colors">
          <Trash2 size={11} />
        </button>
      </div>

      {/* Error */}
      {server.error && (
        <div className="px-3 pb-2 text-xs text-signal-red/80 font-mono">{server.error}</div>
      )}

      {/* Tools list */}
      <AnimatePresence>
        {expanded && server.tools.length > 0 && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="border-t border-carbon-900 overflow-hidden">
            <div className="p-2 space-y-1">
              {server.tools.map(tool => (
                <div key={tool.name} className="flex items-start gap-2 px-2 py-1.5 bg-carbon-975 rounded-lg">
                  <Wrench size={10} className="text-void-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-mono text-carbon-200">{tool.name}</div>
                    <div className="text-xs text-carbon-600 line-clamp-1">{tool.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── AddServerForm ────────────────────────────────────────
function AddServerForm({ onAdd, onCancel }: {
  onAdd: (data: Partial<MCPServer>) => void; onCancel: () => void
}) {
  const [name,      setName]      = useState('')
  const [transport, setTransport] = useState<MCPTransport>('stdio')
  const [command,   setCommand]   = useState('')
  const [args,      setArgs]      = useState('')
  const [url,       setUrl]       = useState('')

  return (
    <div className="p-4 border-b border-carbon-900 bg-carbon-950 space-y-3">
      <p className="text-xs font-semibold text-carbon-400 uppercase tracking-wide">New MCP Server</p>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="Server name"
        className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-3 py-2 text-white placeholder-carbon-600 outline-none focus:border-void-500 transition-colors selectable" />

      <div className="flex gap-2">
        {(['stdio','sse','websocket'] as MCPTransport[]).map(t => (
          <button key={t} onClick={() => setTransport(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${transport===t ? 'bg-void-500/20 border-void-500/40 text-void-300' : 'border-carbon-800 text-carbon-500 hover:border-carbon-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {transport === 'stdio' ? (
        <>
          <input value={command} onChange={e => setCommand(e.target.value)} placeholder="Command (e.g. npx, python)"
            className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-3 py-2 text-white placeholder-carbon-600 outline-none focus:border-void-500 font-mono selectable" />
          <input value={args} onChange={e => setArgs(e.target.value)} placeholder="Arguments (space-separated)"
            className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-3 py-2 text-white placeholder-carbon-600 outline-none focus:border-void-500 font-mono selectable" />
        </>
      ) : (
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL (e.g. https://mcp.example.com/sse)"
          className="w-full text-xs bg-carbon-975 border border-carbon-800 rounded-lg px-3 py-2 text-white placeholder-carbon-600 outline-none focus:border-void-500 font-mono selectable" />
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 border border-carbon-700 text-carbon-500 rounded-lg text-xs hover:text-white transition-colors">Cancel</button>
        <button onClick={() => {
            const cleanData = {
                name,
                transport,
                command: command || undefined,
                args: args.split(' ').filter(Boolean),
                url: url || undefined,
                enabled: true,
                description: ''
            };
            onAdd(cleanData);
          }}
          disabled={!name.trim()}
          className="flex-1 py-1.5 bg-void-500/20 border border-void-500/40 text-void-300 rounded-lg text-xs font-medium hover:bg-void-500/30 transition-colors disabled:opacity-40">
          Add Server
        </button>
      </div>
    </div>
  )
}

// ─── Built-in Presets ─────────────────────────────────────
const PRESETS = [
  { name:'Filesystem', transport:'stdio' as MCPTransport, command:'npx', args:['@modelcontextprotocol/server-filesystem','.'], icon:<Database size={11}/> },
  { name:'GitHub',     transport:'stdio' as MCPTransport, command:'npx', args:['@modelcontextprotocol/server-github'],      icon:<Globe size={11}/> },
  { name:'Postgres',   transport:'stdio' as MCPTransport, command:'npx', args:['@modelcontextprotocol/server-postgres'],    icon:<Database size={11}/> },
  { name:'Brave Search',transport:'stdio'as MCPTransport, command:'npx', args:['@modelcontextprotocol/server-brave-search'],icon:<Globe size={11}/> },
]
