import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { DollarSign, TrendingUp, Zap, Bot, BarChart3, RefreshCw } from 'lucide-react'
import type { CostSummary } from '../../../shared/types'

export function CostPanel() {
  const { agents, setCostSummary, costSummary } = useStore()
  const [loading, setLoading] = useState(false)
  const [range,   setRange]   = useState<'1d'|'7d'|'30d'|'all'>('7d')

  const refresh = async () => {
    setLoading(true)
    try {
      const now   = new Date()
      const from  = range === '1d' ? new Date(now.getTime() - 86400000) :
                    range === '7d' ? new Date(now.getTime() - 7 * 86400000) :
                    range === '30d'? new Date(now.getTime() - 30 * 86400000) : undefined
      const data = await ipc.invoke?.('cost:summary', { from: from?.toISOString() }) as CostSummary
      setCostSummary(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [range])

  if (!costSummary) return (
    <div className="flex items-center justify-center h-full text-carbon-600">
      <div className="text-center"><BarChart3 size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Loading cost data…</p></div>
    </div>
  )

  const maxDayCost = Math.max(...(costSummary.byDay?.map(d => d.cost) ?? [1]), 0.001)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="panel-header justify-between px-4">
        <span className="flex items-center gap-2"><DollarSign size={13} className="text-signal-green" />Cost Dashboard</span>
        <div className="flex items-center gap-2">
          <div className="flex bg-carbon-950 rounded-lg p-0.5">
            {(['1d','7d','30d','all'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-2 py-0.5 rounded text-xs transition-all ${range===r ? 'bg-carbon-800 text-white' : 'text-carbon-500 hover:text-carbon-300'}`}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={refresh} className="text-carbon-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Total cost card */}
        <div className="bg-gradient-to-br from-void-500/20 to-plasma-500/10 border border-void-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-carbon-400 font-semibold uppercase tracking-wide">Total Cost</span>
            <TrendingUp size={14} className="text-void-400" />
          </div>
          <div className="text-3xl font-display font-bold text-white">
            ${costSummary.total.toFixed(4)}
          </div>
          <div className="text-xs text-carbon-500 mt-1">
            {(costSummary.tokens?.in ?? 0).toLocaleString()} in · {(costSummary.tokens?.out ?? 0).toLocaleString()} out tokens
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          <MiniCard icon={<Zap size={13} />} label="Tokens In"  value={(costSummary.tokens?.in ?? 0).toLocaleString()} />
          <MiniCard icon={<Zap size={13} />} label="Tokens Out" value={(costSummary.tokens?.out ?? 0).toLocaleString()} />
          <MiniCard icon={<Bot size={13} />} label="Agents"     value={String(agents.length)} />
          <MiniCard icon={<DollarSign size={13} />} label="Avg/Day" value={costSummary.byDay?.length ? `$${(costSummary.total / costSummary.byDay.length).toFixed(4)}` : '$0'} />
        </div>

        {/* Daily chart */}
        {costSummary.byDay && costSummary.byDay.length > 0 && (
          <div>
            <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-3">Daily Spend</p>
            <div className="flex items-end gap-1 h-28">
              {costSummary.byDay.slice(-14).map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-void-500/40 hover:bg-void-500/70 rounded-t transition-colors"
                    style={{ height: `${Math.max(4, (d.cost / maxDayCost) * 100)}%` }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 bg-carbon-900 border border-carbon-700 rounded px-1.5 py-0.5 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                    {d.date}: ${d.cost.toFixed(5)}
                  </div>
                  <span className="text-xs text-carbon-700 rotate-45 origin-left" style={{fontSize:8}}>
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By model */}
        {costSummary.byModel && Object.keys(costSummary.byModel).length > 0 && (
          <div>
            <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-2">By Model</p>
            <div className="space-y-2">
              {Object.entries(costSummary.byModel)
                .sort(([,a],[,b]) => b - a)
                .map(([model, cost]) => {
                  const pct = costSummary.total > 0 ? (cost / costSummary.total) * 100 : 0
                  return (
                    <div key={model}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-carbon-400 font-mono truncate">{model}</span>
                        <span className="text-carbon-300 flex-shrink-0 ml-2">${cost.toFixed(5)}</span>
                      </div>
                      <div className="h-1.5 bg-carbon-900 rounded-full overflow-hidden">
                        <div className="h-full bg-void-500/70 rounded-full transition-all" style={{width:`${pct}%`}} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* By agent */}
        {costSummary.byAgent && Object.keys(costSummary.byAgent).length > 0 && (
          <div>
            <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-2">By Agent</p>
            <div className="space-y-1.5">
              {Object.entries(costSummary.byAgent)
                .sort(([,a],[,b]) => b - a)
                .slice(0, 8)
                .map(([agentId, cost]) => {
                  const agent = agents.find(a => a.id === agentId)
                  return (
                    <div key={agentId} className="flex items-center justify-between bg-carbon-950 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {agent && <span className={`status-dot ${agent.status}`} />}
                        <span className="text-xs text-carbon-300 truncate">{agent?.name ?? agentId.slice(0,8)}</span>
                      </div>
                      <span className="text-xs font-mono text-carbon-400">${cost.toFixed(5)}</span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-carbon-950 border border-carbon-900 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-carbon-500 mb-1.5">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-base font-mono font-semibold text-white">{value}</div>
    </div>
  )
}
