import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { Plus, X, Terminal } from 'lucide-react'
import type { TerminalSession } from '../../../shared/types'

interface Tab { session: TerminalSession; xterm: XTerm; fit: FitAddon }

export function TerminalPanel() {
  const { agents, workspaces, ui } = useStore()
  const [tabs, setTabs]   = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tabsRef      = useRef<Tab[]>([])
  tabsRef.current    = tabs

  const activeTab = tabs.find(t => t.session.id === active)

  // ─── Listen for terminal output ───────────────────
  useEffect(() => {
    if (!ipc.terminal?.onOutput) return
    const unsub = ipc.terminal.onOutput((data: unknown) => {
      const d = data as { id: string; data: string }
      const tab = tabsRef.current.find(t => t.session.id === d.id)
      tab?.xterm.write(d.data)
    })
    return () => unsub?.()
  }, [])

  // ─── Resize observer ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => activeTab?.fit.fit())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [activeTab])

  // ─── Create terminal tab ──────────────────────────
  const createTab = useCallback(async () => {
    const agent   = agents.find(a => a.id === ui.selectedAgentId)
    const ws      = workspaces.find(w => w.id === (agent?.workspaceId ?? ui.selectedWsId))
    const session = await ipc.terminal.create({
      workspaceId: ws?.id ?? 'default',
      agentId:     agent?.id,
      cwd:         ws?.path,
    }) as TerminalSession

    const xterm = new XTerm({
      theme: {
        background: '#0a0b0d',
        foreground: '#e2e3e6',
        cursor:     '#6355fa',
        black:      '#111317',
        red:        '#ff3355',
        green:      '#00ff88',
        yellow:     '#ffdd00',
        blue:       '#6355fa',
        magenta:    '#ff26c5',
        cyan:       '#00aaff',
        white:      '#e2e3e6',
        brightBlack:  '#636874',
        brightRed:    '#ff6680',
        brightGreen:  '#66ffb3',
        brightYellow: '#ffe566',
        brightBlue:   '#9c91fb',
        brightMagenta:'#ff79da',
        brightCyan:   '#66ccff',
        brightWhite:  '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize:    13,
      lineHeight:  1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback:  5000,
      allowTransparency: true,
    })

    const fit   = new FitAddon()
    const links = new WebLinksAddon()
    xterm.loadAddon(fit)
    xterm.loadAddon(links)

    xterm.onData(data => ipc.terminal.input(session.id, data))
    xterm.onResize(({ cols, rows }) => ipc.terminal.resize(session.id, cols, rows))

    const tab: Tab = { session, xterm, fit }
    setTabs(prev => [...prev, tab])
    setActive(session.id)

    // Mount after state update
    setTimeout(() => {
      if (containerRef.current) {
        xterm.open(containerRef.current)
        fit.fit()
      }
    }, 50)
  }, [agents, workspaces, ui.selectedAgentId, ui.selectedWsId])

  // ─── Switch active tab ────────────────────────────
  useEffect(() => {
    if (!active || !containerRef.current) return
    const tab = tabs.find(t => t.session.id === active)
    if (!tab) return

    // Re-mount the active terminal
    containerRef.current.innerHTML = ''
    tab.xterm.open(containerRef.current)
    setTimeout(() => tab.fit.fit(), 20)
  }, [active])

  // ─── Close tab ────────────────────────────────────
  const closeTab = useCallback(async (id: string) => {
    await ipc.terminal.destroy(id)
    setTabs(prev => {
      const next = prev.filter(t => t.session.id !== id)
      if (active === id) setActive(next[next.length - 1]?.session.id ?? null)
      return next
    })
  }, [active])

  return (
    <div className="flex flex-col h-full bg-carbon-975">
      {/* Tab bar */}
      <div className="flex items-center border-b border-carbon-900 bg-carbon-975 overflow-x-auto flex-shrink-0">
        {tabs.map(tab => (
          <div
            key={tab.session.id}
            onClick={() => setActive(tab.session.id)}
            className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer flex-shrink-0 border-r border-carbon-900 transition-colors ${
              active === tab.session.id
                ? 'bg-carbon-925 text-white border-b-2 border-b-void-500'
                : 'text-carbon-500 hover:text-carbon-300 hover:bg-carbon-950'
            }`}
          >
            <Terminal size={11} />
            <span className="font-mono">{tab.session.title}</span>
            {tab.session.agentId && (
              <span className="text-void-400 text-xs">·</span>
            )}
            <button
              onClick={e => { e.stopPropagation(); closeTab(tab.session.id) }}
              className="ml-1 hover:text-signal-red transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        <button
          onClick={createTab}
          className="flex items-center gap-1 px-3 py-2 text-xs text-carbon-500 hover:text-white hover:bg-carbon-950 transition-colors flex-shrink-0"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {/* Terminal area */}
      {tabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center p-6">
          <div className="w-14 h-14 rounded-xl bg-carbon-900 border border-carbon-800 flex items-center justify-center mb-3">
            <Terminal size={22} className="text-carbon-600" />
          </div>
          <p className="text-sm text-carbon-500 mb-4">No terminal sessions open</p>
          <button
            onClick={createTab}
            className="bg-void-500 hover:bg-void-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Open Terminal
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden p-2"
          style={{ background: '#0a0b0d' }}
        />
      )}
    </div>
  )
}
