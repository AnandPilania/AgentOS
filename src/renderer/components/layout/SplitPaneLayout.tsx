import React, { useCallback, useState } from 'react'
import { useStore } from '../../store'
const uuid = () => crypto.randomUUID()
import { ChatPanel }     from '../chat/ChatPanel'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { DiffPanel }     from '../diff/DiffPanel'
import { GraphPanel }    from '../graph/GraphPanel'
import { PipelinePanel } from '../pipeline/PipelinePanel'
import { FilesPanel }    from '../workspace/FilesPanel'
import { MCPPanel }      from '../mcp/MCPPanel'
import { CostPanel }     from '../cost/CostPanel'
import { TemplatesPanel }from '../agents/TemplatesPanel'
import {
  LayoutTemplate, Columns2, Grid2X2, Maximize2,
  Bot, Terminal, GitCompare, Network, FolderOpen,
  ChevronDown
} from 'lucide-react'
import type { ActivePanel } from '../../store'
import type { Pane, PaneLayout } from '../../../shared/types'
import { TeamPanel } from '../team/TeamPanel'

const PANEL_COMPONENTS: Record<ActivePanel, React.ComponentType<{paneId?:string}>> = {
  chat:      ChatPanel,
  terminal:  TerminalPanel,
  diff:      DiffPanel,
  graph:     GraphPanel,
  files:     FilesPanel,
  mcp:       MCPPanel,
  cost:      CostPanel,
  templates: TemplatesPanel,
  pipeline:  PipelinePanel,
  team: TeamPanel,
}

const LAYOUT_PRESETS: { id: PaneLayout; label: string; icon: React.ReactNode; cols: number; rows: number }[] = [
  { id: 'single',  label: '1 Pane',   icon: <Maximize2 size={14} />, cols: 1, rows: 1 },
  { id: 'split-h', label: '2 Horizontal', icon: <Columns2 size={14} />, cols: 2, rows: 1 },
  { id: 'split-v', label: '2 Vertical',   icon: <Columns2 size={14} className="rotate-90" />, cols: 1, rows: 2 },
  { id: 'quad',    label: '4 Panes',  icon: <Grid2X2 size={14} />, cols: 2, rows: 2 },
]

export function SplitPaneLayout() {
  const { ui, agents, setPaneLayout, setPaneConfig, setActivePaneId } = useStore()
  const { paneLayout, paneConfig, activePaneId } = ui

  // Auto-initialize single pane when we have agents but no panes configured
  React.useEffect(() => {
    if (agents.length > 0 && panes.length === 0) {
      const panes: Pane[] = [{ id: crypto.randomUUID(), agentId: agents[0].id, panel: 'chat', size: 100, position: 0 }]
      setPaneLayout('single')
      setPaneConfig({ panes })
      setActivePaneId(panes[0].id)
      useStore.getState().selectAgent(agents[0].id)
    }
  }, [agents.length, (paneConfig?.panes || []).length])

  const initPanes = useCallback((layout: PaneLayout) => {
    const paneCount = layout === 'single' ? 1 : layout === 'quad' ? 4 : 2
    const agentList = agents.slice(0, paneCount)
    const panels: ActivePanel[] = ['chat','terminal','diff','files']

    const panes: Pane[] = Array.from({ length: paneCount }, (_, i) => ({
      id:      uuid(),
      agentId: agentList[i]?.id,
      panel:   panels[i % panels.length],
      size:    100 / paneCount,
      position:i,
    }))

    setPaneLayout(layout)
    setPaneConfig({ panes })
    setActivePaneId(panes[0]?.id ?? null)
    // Also select first agent for convenience
    if (panes[0]?.agentId) useStore.getState().selectAgent(panes[0].agentId)
  }, [agents, setPaneLayout, setPaneConfig, setActivePaneId])

  const panes = paneConfig?.panes || []

  if (panes.length === 0) {
    return <EmptyPaneState onInit={initPanes} />
  }

  const isHorizontal = paneLayout === 'split-h' || paneLayout === 'quad'
  const isVertical   = paneLayout === 'split-v'
  const isQuad       = paneLayout === 'quad'

  return (
    <div className="flex flex-col h-full">
      {/* Layout switcher bar */}
      <PaneToolbar onLayoutChange={initPanes} currentLayout={paneLayout} />

      {/* Pane grid */}
      <div className={`flex-1 overflow-hidden ${
        isQuad ? 'grid grid-cols-2 grid-rows-2' :
        isHorizontal ? 'flex flex-row' :
        isVertical   ? 'flex flex-col' : 'flex'
      }`}>
        {panes.map((pane, idx) => (
          <React.Fragment key={pane.id}>
            <PaneView
              pane={pane}
              isActive={activePaneId === pane.id}
              onActivate={() => setActivePaneId(pane.id)}
            />
            {/* Resize divider between panes (not after last) */}
            {idx < panes.length - 1 && !isQuad && (
              <ResizeDivider
                vertical={isHorizontal}
                paneIds={[pane.id, panes[idx+1].id]}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── PaneView ─────────────────────────────────────────────
function PaneView({ pane, isActive, onActivate }: {
  pane: Pane; isActive: boolean; onActivate: () => void
}) {
  const { agents, setPanelForPane, setAgentForPane } = useStore()
  const agent  = agents.find(a => a.id === pane.agentId)
  const Panel  = PANEL_COMPONENTS[pane.panel]

  return (
    <div
      className={`flex flex-col overflow-hidden relative border transition-all ${
        isActive ? 'border-void-500/40' : 'border-carbon-900'
      }`}
      style={{ flex: 1 }}
      onClick={onActivate}
    >
      {/* Pane header */}
      <PaneHeader
        pane={pane}
        agent={agent}
        isActive={isActive}
        onPanelChange={(panel) => setPanelForPane(pane.id, panel as ActivePanel)}
        onAgentChange={(agentId) => setAgentForPane(pane.id, agentId)}
      />

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        <Panel paneId={pane.id} />
      </div>

      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-void-500/60 pointer-events-none" />
      )}
    </div>
  )
}

// ─── PaneHeader ───────────────────────────────────────────
function PaneHeader({ pane, agent, isActive, onPanelChange, onAgentChange }: {
  pane: Pane; agent: ReturnType<typeof useStore.getState>['agents'][0] | undefined
  isActive: boolean; onPanelChange: (p: string) => void; onAgentChange: (id: string) => void
}) {
  const { agents } = useStore()
  const [showPanelMenu,  setShowPanelMenu]  = useState(false)
  const [showAgentMenu,  setShowAgentMenu]  = useState(false)

  const PANEL_ICONS: Record<string, React.ReactNode> = {
    chat:     <Bot      size={11} />,
    terminal: <Terminal size={11} />,
    diff:     <GitCompare  size={11} />,
    graph:    <Network  size={11} />,
    files:    <FolderOpen size={11} />,
  }

  const PANEL_OPTIONS: ActivePanel[] = ['chat','terminal','diff','files','graph']

  return (
    <div className={`flex items-center gap-1 px-2 py-1 border-b text-xs select-none flex-shrink-0 ${
      isActive ? 'border-carbon-800 bg-carbon-950' : 'border-carbon-900 bg-carbon-975'
    }`}>
      {/* Panel picker */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowPanelMenu(v => !v) }}
          className="flex items-center gap-1 text-carbon-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-carbon-800 transition-colors"
        >
          {PANEL_ICONS[pane.panel]}
          <span className="capitalize">{pane.panel}</span>
          <ChevronDown size={9} />
        </button>
        {showPanelMenu && (
          <div className="absolute top-full left-0 mt-1 bg-carbon-900 border border-carbon-700 rounded-lg overflow-hidden z-50 w-32 shadow-xl">
            {PANEL_OPTIONS.map(p => (
              <button
                key={p}
                onClick={(e) => { e.stopPropagation(); onPanelChange(p); setShowPanelMenu(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-carbon-800 transition-colors ${pane.panel === p ? 'text-void-400' : 'text-carbon-300'}`}
              >
                {PANEL_ICONS[p]}
                <span className="capitalize">{p}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-3 bg-carbon-800" />

      {/* Agent picker */}
      <div className="relative flex-1">
        <button
          onClick={(e) => { e.stopPropagation(); setShowAgentMenu(v => !v) }}
          className="flex items-center gap-1 text-carbon-500 hover:text-carbon-200 px-1 py-0.5 rounded hover:bg-carbon-800 transition-colors max-w-full"
        >
          {agent && <span className={`status-dot ${agent.status} flex-shrink-0`} />}
          <span className="truncate">{agent?.name ?? 'No agent'}</span>
          <ChevronDown size={9} className="flex-shrink-0" />
        </button>
        {showAgentMenu && (
          <div className="absolute top-full left-0 mt-1 bg-carbon-900 border border-carbon-700 rounded-lg overflow-hidden z-50 w-48 shadow-xl">
            {agents.map(a => (
              <button
                key={a.id}
                onClick={(e) => { e.stopPropagation(); onAgentChange(a.id); setShowAgentMenu(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-carbon-800 transition-colors ${pane.agentId === a.id ? 'text-void-400' : 'text-carbon-300'}`}
              >
                <span className={`status-dot ${a.status}`} />
                <span className="truncate">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PaneToolbar ──────────────────────────────────────────
function PaneToolbar({ onLayoutChange, currentLayout }: {
  onLayoutChange: (l: PaneLayout) => void; currentLayout: PaneLayout
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-carbon-900 bg-carbon-975 flex-shrink-0">
      <LayoutTemplate size={12} className="text-carbon-600 mr-1" />
      <span className="text-xs text-carbon-600 mr-2">Layout:</span>
      <div className="flex items-center gap-0.5 bg-carbon-950 rounded-lg p-0.5">
        {LAYOUT_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => onLayoutChange(preset.id)}
            title={preset.label}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
              currentLayout === preset.id
                ? 'bg-carbon-800 text-white'
                : 'text-carbon-500 hover:text-carbon-300'
            }`}
          >
            {preset.icon}
            <span className="hidden xl:inline">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── ResizeDivider ────────────────────────────────────────
function ResizeDivider({ vertical, paneIds }: { vertical: boolean; paneIds: [string, string] }) {
  const [dragging, setDragging] = useState(false)

  const onMouseDown = () => {
    setDragging(true)
    // Simplified — full resize logic would go here
    const onUp = () => { setDragging(false); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className={`flex-shrink-0 ${vertical ? 'w-1 cursor-ew-resize hover:bg-void-500/50' : 'h-1 cursor-ns-resize hover:bg-void-500/50'} bg-carbon-900 transition-colors ${dragging ? 'bg-void-500/70' : ''}`}
    />
  )
}

// ─── Empty state ──────────────────────────────────────────
function EmptyPaneState({ onInit }: { onInit: (l: PaneLayout) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-grid-void bg-grid">
      <div className="w-16 h-16 rounded-2xl bg-void-500/10 border border-void-500/20 flex items-center justify-center mb-5">
        <LayoutTemplate size={28} className="text-void-400" />
      </div>
      <h2 className="font-display text-2xl font-bold text-white mb-2">Choose a layout</h2>
      <p className="text-carbon-500 text-sm mb-8 max-w-xs">
        Work with multiple agents simultaneously. Each pane can show a different agent and panel.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {LAYOUT_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => onInit(preset.id)}
            className="flex flex-col items-center gap-2 p-4 bg-carbon-925 border border-carbon-800 rounded-xl hover:border-void-500/40 hover:bg-carbon-900 transition-all group"
          >
            <div className="text-carbon-500 group-hover:text-void-400 transition-colors">{preset.icon}</div>
            <span className="text-xs font-medium text-carbon-400 group-hover:text-white transition-colors">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
