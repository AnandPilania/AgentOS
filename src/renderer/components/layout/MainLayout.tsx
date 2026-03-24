import React, { useCallback, useRef } from 'react'
import { useStore } from '../../store'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { RightPanel } from './RightPanel'
import { SplitPaneLayout } from './SplitPaneLayout'
import { CommandPalette } from '../agents/CommandPalette'
import { SettingsModal } from '../settings/SettingsModal'
import { NewAgentModal } from '../agents/NewAgentModal'
import { MCPPanel } from '../mcp/MCPPanel'

export function MainLayout() {
  const { ui, setSidebarWidth, setRightWidth } = useStore()
  const leftDrag = useRef(false), rightDrag = useRef(false)
  const startX = useRef(0), startW = useRef(0)
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (leftDrag.current) setSidebarWidth(startW.current + (e.clientX - startX.current))
    if (rightDrag.current) setRightWidth(startW.current - (e.clientX - startX.current))
  }, [setSidebarWidth, setRightWidth])
  const onMouseUp = useCallback(() => { leftDrag.current=false; rightDrag.current=false; document.body.style.cursor=''; document.body.style.userSelect='' }, [])
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-carbon-975" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {ui.sidebarOpen && (
          <div className="relative flex-shrink-0 border-r border-carbon-900" style={{width:ui.sidebarWidth}}>
            <Sidebar />
            <div className="resize-handle resize-handle-x right-0" onMouseDown={e => { leftDrag.current=true; startX.current=e.clientX; startW.current=ui.sidebarWidth; document.body.style.cursor='ew-resize'; document.body.style.userSelect='none' }} />
          </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden"><SplitPaneLayout /></div>
        {ui.rightPanelOpen && (
          <div className="relative flex-shrink-0 border-l border-carbon-900" style={{width:ui.rightWidth}}>
            <div className="resize-handle resize-handle-x left-0" onMouseDown={e => { rightDrag.current=true; startX.current=e.clientX; startW.current=ui.rightWidth; document.body.style.cursor='ew-resize'; document.body.style.userSelect='none' }} />
            <RightPanel />
          </div>
        )}
      </div>
      {ui.commandPaletteOpen && <CommandPalette />}
      {ui.settingsOpen && <SettingsModal />}
      {ui.newAgentOpen && <NewAgentModal />}
      {ui.mcpOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => useStore.getState().toggleMCP()} />
          <div className="w-96 bg-carbon-950 border-l border-carbon-800 h-full shadow-2xl overflow-hidden"><MCPPanel /></div>
        </div>
      )}
    </div>
  )
}
