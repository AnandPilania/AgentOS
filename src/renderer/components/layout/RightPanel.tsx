import React from 'react'
import { useStore } from '../../store'
import { Activity, Zap, Clock, Hash, DollarSign, GitCompare, Tag, Wrench } from 'lucide-react'
import type { Agent } from '../../../shared/types'

export function RightPanel() {
  const { agents, ui, diffs } = useStore()
  const agent = agents.find(a => a.id === ui.selectedAgentId)
  return (
    <div className="flex flex-col h-full bg-carbon-975 overflow-y-auto">
      {agent ? <AgentDetail agent={agent} fileDiffs={diffs[agent.workspaceId]??[]} /> : <EmptyState />}
    </div>
  )
}

function AgentDetail({ agent, fileDiffs }: { agent: Agent; fileDiffs: ReturnType<typeof useStore.getState>['diffs'][string] }) {
  const statusColor: Record<string,string> = { running:'text-signal-green', idle:'text-carbon-400', error:'text-signal-red', paused:'text-signal-yellow', done:'text-void-400', waiting:'text-signal-blue', queued:'text-carbon-500' }
  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1"><span className={`status-dot ${agent.status}`}/><span className={`text-xs font-semibold font-mono uppercase tracking-wide ${statusColor[agent.status]}`}>{agent.status}</span></div>
        <h3 className="font-display font-bold text-white text-sm">{agent.name}</h3>
        <p className="text-xs text-carbon-500 mt-0.5 font-mono">{agent.provider} · {agent.model}</p>
      </div>
      <Section title="Stats" icon={<Activity size={11}/>}>
        <div className="grid grid-cols-2 gap-1.5">
          <Stat icon={<Zap size={10}/>}       label="Tokens In"  value={agent.stats.tokensIn.toLocaleString()}/>
          <Stat icon={<Zap size={10}/>}       label="Tokens Out" value={agent.stats.tokensOut.toLocaleString()}/>
          <Stat icon={<Clock size={10}/>}     label="Duration"   value={fmt(agent.stats.duration)}/>
          <Stat icon={<Hash size={10}/>}      label="Turns"      value={String(agent.stats.turns)}/>
          <Stat icon={<DollarSign size={10}/>}label="Cost"       value={`$${agent.stats.cost.toFixed(5)}`}/>
          <Stat icon={<Wrench size={10}/>}    label="Tool Calls" value={String(agent.stats.toolCalls??0)}/>
        </div>
      </Section>
      {agent.tools.length > 0 && (
        <Section title="Tools" icon={<Wrench size={11}/>}>
          <div className="flex flex-wrap gap-1">
            {agent.tools.map(t => <span key={t} className="text-xs bg-carbon-900 border border-carbon-800 px-1.5 py-0.5 rounded font-mono text-carbon-500">{t}</span>)}
          </div>
        </Section>
      )}
      {agent.tags.length > 0 && (
        <Section title="Tags" icon={<Tag size={11}/>}>
          <div className="flex flex-wrap gap-1">
            {agent.tags.map(t => <span key={t} className="text-xs bg-carbon-900 border border-carbon-700 px-2 py-0.5 rounded-full text-carbon-400">{t}</span>)}
          </div>
        </Section>
      )}
      {fileDiffs.length > 0 && (
        <Section title="Changes" icon={<GitCompare size={11}/>}>
          <div className="space-y-1">
            {fileDiffs.slice(0,8).map(d => (
              <div key={d.path} className="flex items-center gap-2 text-xs">
                <span className={d.type==='added'?'text-signal-green':d.type==='deleted'?'text-signal-red':'text-signal-yellow'}>{d.type==='added'?'+':d.type==='deleted'?'-':'~'}</span>
                <span className="text-carbon-400 truncate flex-1 font-mono" title={d.path}>{d.path.split('/').pop()}</span>
                <span className="text-carbon-600 font-mono flex-shrink-0">+{d.additions}-{d.deletions}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <div className="text-xs text-carbon-700 space-y-0.5 pt-2 border-t border-carbon-900">
        <div>Created {new Date(agent.createdAt).toLocaleString()}</div>
        <div className="font-mono text-carbon-800 mt-1 break-all">{agent.id}</div>
      </div>
    </div>
  )
}

function Section({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}) {
  return <div><div className="flex items-center gap-1.5 text-xs text-carbon-500 font-semibold uppercase tracking-wider mb-2">{icon}{title}</div>{children}</div>
}

function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return (
    <div className="bg-carbon-950 border border-carbon-900 rounded-lg p-2">
      <div className="flex items-center gap-1 text-carbon-600 mb-1">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-white text-xs font-mono font-semibold">{value}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-12 h-12 rounded-xl bg-carbon-900 border border-carbon-800 flex items-center justify-center mb-3"><Activity size={20} className="text-carbon-600"/></div>
      <p className="text-sm text-carbon-500">Select an agent</p>
    </div>
  )
}

function fmt(ms:number):string { if(ms<1000) return `${ms}ms`; if(ms<60000) return `${(ms/1000).toFixed(1)}s`; return `${Math.floor(ms/60000)}m` }
