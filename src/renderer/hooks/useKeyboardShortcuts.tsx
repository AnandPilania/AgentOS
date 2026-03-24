import React from 'react'
import { useEffect } from 'react'
import { useStore } from '../store'
import { ipc } from './useIPC'

const isMac = ipc.platform === 'darwin'
const mod   = (e: KeyboardEvent) => isMac ? e.metaKey : e.ctrlKey

interface Shortcut {
  key:      string
  mod?:     boolean
  shift?:   boolean
  alt?:     boolean
  action:   () => void
  label:    string
  category: string
}

export function useKeyboardShortcuts() {
  const store = useStore()

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      // ─── Global ─────────────────────────────────────────
      { key:'k',     mod:true,               action:()=> store.toggleCommandPalette(), label:'Command Palette',      category:'Global' },
      { key:'/',     mod:true,               action:()=> store.toggleSearch(),          label:'Global Search',        category:'Global' },
      { key:',',     mod:true,               action:()=> store.toggleSettings(),        label:'Settings',             category:'Global' },
      { key:'n',     mod:true,               action:()=> store.toggleNewAgent(),        label:'New Agent',            category:'Global' },
      { key:'b',     mod:true,               action:()=> store.toggleSidebar(),         label:'Toggle Sidebar',       category:'Global' },
      { key:'.',     mod:true,               action:()=> store.toggleRightPanel(),      label:'Toggle Right Panel',   category:'Global' },

      // ─── Panel Switching ─────────────────────────────────
      { key:'1',     mod:true,               action:()=> store.setActivePanel('chat'),      label:'Chat Panel',       category:'Panels' },
      { key:'2',     mod:true,               action:()=> store.setActivePanel('terminal'),  label:'Terminal Panel',   category:'Panels' },
      { key:'3',     mod:true,               action:()=> store.setActivePanel('diff'),      label:'Diff Panel',       category:'Panels' },
      { key:'4',     mod:true,               action:()=> store.setActivePanel('graph'),     label:'Graph Panel',      category:'Panels' },
      { key:'5',     mod:true,               action:()=> store.setActivePanel('files'),     label:'Files Panel',      category:'Panels' },
      { key:'6',     mod:true,               action:()=> store.setActivePanel('mcp'),       label:'MCP Panel',        category:'Panels' },
      { key:'7',     mod:true,               action:()=> store.setActivePanel('cost'),      label:'Cost Dashboard',   category:'Panels' },
      { key:'8',     mod:true,               action:()=> store.setActivePanel('templates'), label:'Templates',        category:'Panels' },

      // ─── Pane Layouts ────────────────────────────────────
      { key:'1',     mod:true, shift:true,   action:()=> store.setPaneLayout('single'),  label:'Single Pane',         category:'Layout' },
      { key:'2',     mod:true, shift:true,   action:()=> store.setPaneLayout('split-h'), label:'2 Panes Horizontal',  category:'Layout' },
      { key:'4',     mod:true, shift:true,   action:()=> store.setPaneLayout('quad'),    label:'4 Panes',             category:'Layout' },

      // ─── Agent ───────────────────────────────────────────
      { key:'Enter', mod:true,               action:()=> {
          const id = store.ui.selectedAgentId
          if (id) {
            const a = store.agents.find(x => x.id === id)
            if (a?.status === 'running') ipc.agents.stop(id)
            else if (a) ipc.agents.start(id)
          }
        }, label:'Start/Stop Agent', category:'Agent' },
      { key:'d',     mod:true,               action:()=> {
          const id = store.ui.selectedAgentId
          if (id) {
            const ws = store.workspaces.find(w => w.id === store.agents.find(a => a.id === id)?.workspaceId)
            if (ws) ipc.workspaces.diff(ws.id).then((d: unknown) => store.setDiff(ws.id, d as [])).catch(console.error)
          }
        }, label:'Refresh Diff', category:'Agent' },

      // ─── Navigation ──────────────────────────────────────
      { key:'ArrowUp',  mod:true,  action:()=> {
          const agents = store.agents
          const idx    = agents.findIndex(a => a.id === store.ui.selectedAgentId)
          if (idx > 0) store.selectAgent(agents[idx-1].id)
          else if (idx === -1 && agents.length > 0) store.selectAgent(agents[0].id)
        }, label:'Previous Agent', category:'Navigation' },
      { key:'ArrowDown',mod:true,  action:()=> {
          const agents = store.agents
          const idx    = agents.findIndex(a => a.id === store.ui.selectedAgentId)
          if (idx < agents.length - 1) store.selectAgent(agents[idx+1].id)
        }, label:'Next Agent', category:'Navigation' },

      // ─── Escape to close modals ──────────────────────────
      { key:'Escape', action:()=> {
          if (store.ui.commandPaletteOpen) store.toggleCommandPalette()
          else if (store.ui.searchOpen)    store.toggleSearch()
          else if (store.ui.newAgentOpen)  store.toggleNewAgent()
          else if (store.ui.settingsOpen)  store.toggleSettings()
          else if (store.ui.mcpOpen)       store.toggleMCP()
        }, label:'Close Modal', category:'Global' },
    ]

    const handler = (e: KeyboardEvent) => {
      // Skip if focused in editable area (except known safe shortcuts)
      const tag = (e.target as HTMLElement).tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if (isEditable && e.key !== 'Escape') return

      for (const sc of shortcuts) {
        const matchMod   = sc.mod   ? mod(e)   : !mod(e)
        const matchShift = sc.shift ? e.shiftKey: !e.shiftKey
        const matchAlt   = sc.alt   ? e.altKey  : !e.altKey
        const matchKey   = e.key === sc.key

        // For shortcuts without mod, only match key
        const ok = sc.mod !== undefined
          ? matchMod && matchShift && matchKey
          : matchKey && (!sc.shift || e.shiftKey)

        if (ok && !(sc.shift && !e.shiftKey)) {
          if (e.key === sc.key && (sc.mod ? mod(e) : true) && (sc.shift ? e.shiftKey : true)) {
            e.preventDefault()
            sc.action()
            break
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store])
}

// ─── Keyboard Shortcuts Help Modal ────────────────────────
export function ShortcutsHelp() {
  const SHORTCUTS_MAP = [
    { category:'Global',     key:'⌘K',      label:'Command Palette'     },
    { category:'Global',     key:'⌘/',      label:'Global Search'       },
    { category:'Global',     key:'⌘,',      label:'Settings'            },
    { category:'Global',     key:'⌘N',      label:'New Agent'           },
    { category:'Global',     key:'⌘B',      label:'Toggle Sidebar'      },
    { category:'Panels',     key:'⌘1',      label:'Chat'                },
    { category:'Panels',     key:'⌘2',      label:'Terminal'            },
    { category:'Panels',     key:'⌘3',      label:'Diff'                },
    { category:'Panels',     key:'⌘4',      label:'Graph'               },
    { category:'Panels',     key:'⌘5',      label:'Files'               },
    { category:'Panels',     key:'⌘6',      label:'MCP'                 },
    { category:'Panels',     key:'⌘7',      label:'Cost'                },
    { category:'Panels',     key:'⌘8',      label:'Templates'           },
    { category:'Layout',     key:'⌘⇧1',    label:'Single Pane'         },
    { category:'Layout',     key:'⌘⇧2',    label:'Split Horizontal'    },
    { category:'Layout',     key:'⌘⇧4',    label:'4 Panes'             },
    { category:'Agent',      key:'⌘↵',     label:'Start/Stop Agent'    },
    { category:'Navigation', key:'⌘↑',     label:'Previous Agent'      },
    { category:'Navigation', key:'⌘↓',     label:'Next Agent'          },
    { category:'Global',     key:'Esc',     label:'Close Modal'         },
  ]

  const grouped = SHORTCUTS_MAP.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, typeof SHORTCUTS_MAP>)

  return (
    <div className="grid grid-cols-2 gap-6">
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-carbon-500 uppercase tracking-wide mb-2">{cat}</h4>
          <div className="space-y-1">
            {items.map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-xs text-carbon-400">{item.label}</span>
                <kbd className="text-xs bg-carbon-900 border border-carbon-700 text-carbon-300 px-1.5 py-0.5 rounded font-mono">{item.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
