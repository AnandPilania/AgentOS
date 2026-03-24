import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store'

export function CommandPalette() {
  const { agents, toggleCommandPalette, toggleNewAgent, toggleSettings, selectAgent, setActivePanel, toggleSearch, toggleMCP } = useStore()
  const [query, setQuery] = useState('')
  const items = [
    { label:'New Agent',        action:()=>{toggleCommandPalette();toggleNewAgent()},        icon:'⊕' },
    { label:'Global Search',    action:()=>{toggleCommandPalette();toggleSearch()},           icon:'🔍' },
    { label:'Settings',         action:()=>{toggleCommandPalette();toggleSettings()},         icon:'⚙' },
    { label:'MCP Servers',      action:()=>{toggleCommandPalette();toggleMCP()},              icon:'🔌' },
    { label:'Chat Panel',       action:()=>{toggleCommandPalette();setActivePanel('chat')},   icon:'💬' },
    { label:'Terminal',         action:()=>{toggleCommandPalette();setActivePanel('terminal')},icon:'>' },
    { label:'Diff',             action:()=>{toggleCommandPalette();setActivePanel('diff')},   icon:'±' },
    { label:'Graph',            action:()=>{toggleCommandPalette();setActivePanel('graph')},  icon:'⬡' },
    { label:'Files',            action:()=>{toggleCommandPalette();setActivePanel('files')},  icon:'📁' },
    { label:'Cost Dashboard',   action:()=>{toggleCommandPalette();setActivePanel('cost')},   icon:'💰' },
    { label:'Templates',        action:()=>{toggleCommandPalette();setActivePanel('templates')},icon:'✨'},
    { label:'MCP Panel',        action:()=>{toggleCommandPalette();setActivePanel('mcp')},    icon:'🔌' },
    ...agents.map(a => ({ label:`Agent: ${a.name}`, action:()=>{toggleCommandPalette();selectAgent(a.id)}, icon:'🤖' })),
  ].filter(i => !query || i.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm" onClick={toggleCommandPalette}>
      <motion.div initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} className="w-full max-w-lg mx-4 panel overflow-hidden shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-carbon-900">
          <span className="text-carbon-500 text-sm">⌘</span>
          <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Type a command…"
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-carbon-500 selectable"
            onKeyDown={e=>{if(e.key==='Escape') toggleCommandPalette()}}/>
          <kbd className="text-xs text-carbon-600 bg-carbon-900 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length===0 ? <div className="text-center py-6 text-carbon-600 text-sm">No results</div>
          : items.map((item,i) => (
            <button key={i} onClick={item.action} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-carbon-925 transition-colors text-left">
              <span className="text-base">{item.icon}</span>
              <span className="text-sm text-carbon-300">{item.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
