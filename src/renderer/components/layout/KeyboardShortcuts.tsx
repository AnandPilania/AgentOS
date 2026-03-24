import { useEffect } from 'react'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'

const isMac = ipc.platform === 'darwin'
const mod   = isMac ? 'Meta' : 'Control'

interface Shortcut {
  key:      string
  mod?:     boolean
  shift?:   boolean
  alt?:     boolean
  action:   (store: ReturnType<typeof useStore.getState>) => void
  label:    string
  category: string
}

export const SHORTCUTS: Shortcut[] = [
  // Navigation
  { key:'k', mod:true,  action:s=>s.toggleCommandPalette(), label:`${isMac?'⌘':'Ctrl'}+K - Command Palette`, category:'Navigation' },
  { key:'p', mod:true,  action:s=>s.toggleSearch(),         label:`${isMac?'⌘':'Ctrl'}+P - Quick Search`,    category:'Navigation' },
  { key:',', mod:true,  action:s=>s.toggleSettings(),       label:`${isMac?'⌘':'Ctrl'}+, - Settings`,        category:'Navigation' },

  // Panels
  { key:'1', mod:true,  action:s=>s.setActivePanel('chat'),     label:`${isMac?'⌘':'Ctrl'}+1 - Chat`,     category:'Panels' },
  { key:'2', mod:true,  action:s=>s.setActivePanel('terminal'), label:`${isMac?'⌘':'Ctrl'}+2 - Terminal`, category:'Panels' },
  { key:'3', mod:true,  action:s=>s.setActivePanel('diff'),     label:`${isMac?'⌘':'Ctrl'}+3 - Diff`,     category:'Panels' },
  { key:'4', mod:true,  action:s=>s.setActivePanel('files'),    label:`${isMac?'⌘':'Ctrl'}+4 - Files`,    category:'Panels' },
  { key:'5', mod:true,  action:s=>s.setActivePanel('graph'),    label:`${isMac?'⌘':'Ctrl'}+5 - Graph`,    category:'Panels' },
  { key:'6', mod:true,  action:s=>s.setActivePanel('mcp'),      label:`${isMac?'⌘':'Ctrl'}+6 - MCP`,      category:'Panels' },
  { key:'7', mod:true,  action:s=>s.setActivePanel('cost'),     label:`${isMac?'⌘':'Ctrl'}+7 - Cost`,     category:'Panels' },
  { key:'8', mod:true,  action:s=>s.setActivePanel('templates'),label:`${isMac?'⌘':'Ctrl'}+8 - Templates`,category:'Panels' },

  // Layout
  { key:'1', mod:true, shift:true, action:s=>{ s.setPaneLayout('single');  s.setPaneConfig({panes:[]}) }, label:`${isMac?'⌘':'Ctrl'}+Shift+1 - Single pane`,  category:'Layout' },
  { key:'2', mod:true, shift:true, action:s=>{ s.setPaneLayout('split-h'); s.setPaneConfig({panes:[]}) }, label:`${isMac?'⌘':'Ctrl'}+Shift+2 - Split H`,      category:'Layout' },
  { key:'3', mod:true, shift:true, action:s=>{ s.setPaneLayout('split-v'); s.setPaneConfig({panes:[]}) }, label:`${isMac?'⌘':'Ctrl'}+Shift+3 - Split V`,      category:'Layout' },
  { key:'4', mod:true, shift:true, action:s=>{ s.setPaneLayout('quad');    s.setPaneConfig({panes:[]}) }, label:`${isMac?'⌘':'Ctrl'}+Shift+4 - Quad panes`,   category:'Layout' },

  // Agents
  { key:'n', mod:true, action:s=>s.toggleNewAgent(),   label:`${isMac?'⌘':'Ctrl'}+N - New Agent`,      category:'Agents' },
  { key:'b', mod:true, action:s=>s.toggleSidebar(),    label:`${isMac?'⌘':'Ctrl'}+B - Toggle Sidebar`, category:'View' },
  { key:'j', mod:true, action:s=>s.toggleRightPanel(), label:`${isMac?'⌘':'Ctrl'}+J - Right Panel`,    category:'View' },

  // Quick agent selection
  ...[1,2,3,4,5,6,7,8,9].map(n => ({
    key:      String(n),
    alt:      true,
    action:   (s: ReturnType<typeof useStore.getState>) => {
      const agent = s.agents[n-1]
      if (agent) s.selectAgent(agent.id)
    },
    label:    `Alt+${n} - Select Agent ${n}`,
    category: 'Agents',
  })),
]

export function KeyboardShortcuts() {
  const store = useStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire in input fields (except specific combos)
      const target = e.target as HTMLElement
      const inInput = ['INPUT','TEXTAREA','SELECT'].includes(target.tagName) ||
                      target.contentEditable === 'true'

      for (const shortcut of SHORTCUTS) {
        const modMatch   = shortcut.mod   ? (e.metaKey || e.ctrlKey) : (!e.metaKey && !e.ctrlKey)
        const shiftMatch = shortcut.shift ? e.shiftKey  : !e.shiftKey
        const altMatch   = shortcut.alt   ? e.altKey    : !e.altKey
        const keyMatch   = e.key === shortcut.key || e.key === shortcut.key.toUpperCase()

        if (modMatch && shiftMatch && altMatch && keyMatch) {
          // Allow modifier+key even in inputs, but not bare keys
          if (!inInput || shortcut.mod || shortcut.alt) {
            e.preventDefault()
            shortcut.action(store)
            return
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store])

  return null
}

// ─── ShortcutsHelpModal ──────────────────────────────────
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const categories = [...new Set(SHORTCUTS.map(s => s.category))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="panel w-full max-w-2xl mx-4 overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="panel-header justify-between px-5 py-3.5">
          <span className="font-display font-bold text-white text-sm">Keyboard Shortcuts</span>
          <button onClick={onClose} className="text-carbon-500 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-5 grid grid-cols-2 gap-6">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-xs font-semibold text-carbon-500 uppercase tracking-wider mb-2">{cat}</p>
              <div className="space-y-1">
                {SHORTCUTS.filter(s => s.category === cat).map(s => {
                  const [combo, ...desc] = s.label.split(' - ')
                  return (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="text-xs text-carbon-400">{desc.join(' - ')}</span>
                      <kbd className="text-xs bg-carbon-900 border border-carbon-800 px-1.5 py-0.5 rounded font-mono text-carbon-300 flex-shrink-0 ml-2">{combo}</kbd>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
