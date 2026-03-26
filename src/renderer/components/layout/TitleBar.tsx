import React from 'react'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { PanelLeft, PanelRight, Terminal, GitBranch, Diff, Network, MessageSquare, Settings, Plus, Search, PlugZap, DollarSign, Sparkles, LogOut, GitMerge } from 'lucide-react'
import type { ActivePanel } from '../../store'
import AnimatedLogo from '../Logo'
import { Users } from 'lucide-react'

const isMac = ipc.platform === 'darwin'

export function TitleBar() {
  const { ui, agents, user, presence, toggleSidebar, toggleRightPanel, setActivePanel, toggleSettings, toggleNewAgent, toggleSearch, toggleMCP, setToken, setUser } = useStore()
  const runningCount = agents.filter(a => a.status === 'running').length
  const errorCount   = agents.filter(a => a.status === 'error').length

  const panelBtns: { id: ActivePanel; icon: React.ReactNode; label: string }[] = [
    { id:'chat',      icon:<MessageSquare size={12}/>, label:'Chat' },
    { id:'terminal',  icon:<Terminal size={12}/>,      label:'Terminal' },
    { id:'diff',      icon:<Diff size={12}/>,          label:'Diff' },
    { id:'graph',     icon:<Network size={12}/>,       label:'Graph' },
    { id:'files',     icon:<GitBranch size={12}/>,     label:'Files' },
    { id:'pipeline',  icon:<GitMerge size={12}/>,      label:'Pipeline' },
    { id:'mcp',       icon:<PlugZap size={12}/>,       label:'MCP' },
    { id:'cost',      icon:<DollarSign size={12}/>,    label:'Cost' },
    { id:'templates', icon:<Sparkles size={12}/>,      label:'Templates' },
     { id:'team', icon:<Users size={12}/>, label:'Team' },
  ]

  return (
    <div className="flex items-center h-10 border-b border-carbon-900 bg-carbon-975 select-none drag-region gap-2 flex-shrink-0"
      style={{ paddingLeft: isMac ? 76 : 10, paddingRight: 10 }}>

      <div className="flex items-center gap-1.5 no-drag flex-shrink-0">
        <button onClick={toggleSidebar} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${ui.sidebarOpen ? 'bg-carbon-800 text-white' : 'text-carbon-500 hover:text-carbon-300 hover:bg-carbon-900'}`}>
          <PanelLeft size={14}/>
        </button>
        <div className="flex items-center gap-1 px-1">
          <AnimatedLogo size={13} />
          <span className="font-display text-xs font-bold text-white tracking-wide">AgentOS</span>
          <span className="text-carbon-700 text-xs ml-0.5">v2</span>
        </div>
      </div>

      {runningCount > 0 && (
        <span className="text-xs bg-signal-green/15 text-signal-green border border-signal-green/20 px-1.5 py-0.5 rounded-full font-mono flex items-center gap-1 no-drag flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse inline-block"/>
          {runningCount}
        </span>
      )}
      {errorCount > 0 && (
        <span className="text-xs bg-signal-red/15 text-signal-red border border-signal-red/20 px-1.5 py-0.5 rounded-full font-mono no-drag flex-shrink-0">{errorCount}!</span>
      )}

      <div className="flex items-center bg-carbon-950 rounded-lg p-0.5 no-drag overflow-x-auto max-w-sm xl:max-w-xl">
        {panelBtns.map(btn => (
          <button key={btn.id} onClick={() => {
            setActivePanel(btn.id)
            // Also update the active pane's panel type
            const store = useStore.getState()
            const paneId = store.ui.activePaneId ?? store.ui.paneConfig.panes[0]?.id
            if (paneId) store.setPanelForPane(paneId, btn.id)
          }} title={btn.label}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all flex-shrink-0 ${(ui.activePanel === btn.id || (ui.activePaneId && ui.paneConfig.panes.find(p => p.id === ui.activePaneId)?.panel === btn.id)) ? 'bg-carbon-800 text-white' : 'text-carbon-500 hover:text-carbon-300'}`}>
            {btn.icon}
            <span className="hidden 2xl:inline">{btn.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1"/>

      {presence.length > 0 && (
        <div className="flex items-center -space-x-1.5 no-drag flex-shrink-0">
          {presence.slice(0,4).map(p => (
            <div key={p.userId} title={p.name} className="w-5 h-5 rounded-full border-2 border-carbon-975 flex items-center justify-center text-xs font-bold" style={{background:p.color}}>
              {p.name.charAt(0)}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-0.5 no-drag flex-shrink-0">
        <Btn onClick={toggleSearch} title="Search ⌘/"><Search size={13}/></Btn>
        <Btn onClick={toggleNewAgent} title="New Agent ⌘N"><Plus size={14}/></Btn>
        <Btn onClick={toggleMCP} title="MCP Servers"><PlugZap size={13}/></Btn>
        <div className="w-px h-4 bg-carbon-800 mx-0.5"/>
        <Btn onClick={toggleRightPanel} active={ui.rightPanelOpen} title="Right Panel"><PanelRight size={14}/></Btn>
        <Btn onClick={toggleSettings} title="Settings ⌘,"><Settings size={13}/></Btn>
        {user && (
          <div className="relative group ml-1">
            <button className="w-6 h-6 rounded-full bg-void-500/30 flex items-center justify-center text-xs text-void-200 font-bold">{user.name.charAt(0)}</button>
            <div className="absolute right-0 top-full w-40 bg-carbon-900 border border-carbon-700 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-50">
              <div className="px-3 py-2 border-b border-carbon-800">
                <div className="text-xs font-medium text-white truncate">{user.name}</div>
                <div className="text-xs text-carbon-500 truncate">{user.email}</div>
              </div>
              <button onClick={() => { setToken(null); setUser(null) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-carbon-400 hover:text-signal-red hover:bg-signal-red/10 transition-colors">
                <LogOut size={11}/> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Btn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${active ? 'bg-carbon-800 text-carbon-100' : 'text-carbon-500 hover:text-carbon-200 hover:bg-carbon-900'}`}>
      {children}
    </button>
  )
}
