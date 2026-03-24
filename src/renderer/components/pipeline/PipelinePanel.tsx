import React, { useCallback, useMemo, useState } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, Panel,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
  type NodeTypes, Position, Handle,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { Bot, Play, Square, GitMerge, Zap, ArrowRight } from 'lucide-react'

// ── Node types ───────────────────────────────────────────────────────────────
function AgentNode({ data }: { data: { label: string; agentId?: string; status?: string } }) {
  const agents = useStore(s => s.agents)
  const agent  = agents.find(a => a.id === data.agentId)
  const statusColor: Record<string, string> = {
    running:'#00ff88', idle:'#636874', error:'#ff3355', paused:'#ffdd00', done:'#6355fa', queued:'#ff7700',
  }
  return (
    <div className={`bg-carbon-925 border rounded-xl p-3 w-44 ${agent?.status === 'running' ? 'border-signal-green/40' : 'border-carbon-700'}`}>
      <Handle type="target" position={Position.Left}  style={{ background:'#6355fa' }}/>
      <Handle type="source" position={Position.Right} style={{ background:'#6355fa' }}/>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded bg-void-500/20 flex items-center justify-center flex-shrink-0">
          <Bot size={10} className="text-void-400"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white truncate">{data.label}</div>
          {agent && <div className="text-xs text-carbon-500 font-mono truncate">{agent.model.split('-').slice(-2).join('-')}</div>}
        </div>
        {agent && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor[agent.status] ?? '#636874' }}/>}
      </div>
    </div>
  )
}

function InputNode({ data }: { data: { label: string } }) {
  return (
    <div className="bg-carbon-925 border border-signal-yellow/30 rounded-xl px-3 py-2">
      <Handle type="source" position={Position.Right} style={{ background:'#ffdd00' }}/>
      <div className="flex items-center gap-1.5"><Zap size={11} className="text-signal-yellow"/><span className="text-xs font-medium text-carbon-200">{data.label || 'Input'}</span></div>
    </div>
  )
}

function OutputNode({ data }: { data: { label: string } }) {
  return (
    <div className="bg-carbon-925 border border-signal-green/30 rounded-xl px-3 py-2">
      <Handle type="target" position={Position.Left} style={{ background:'#00ff88' }}/>
      <div className="flex items-center gap-1.5"><ArrowRight size={11} className="text-signal-green"/><span className="text-xs font-medium text-carbon-200">{data.label || 'Output'}</span></div>
    </div>
  )
}

function MergeNode() {
  return (
    <div className="bg-carbon-925 border border-plasma-500/30 rounded-xl p-3 w-28 text-center">
      <Handle type="target" position={Position.Left}  style={{ background:'#ff26c5' }}/>
      <Handle type="source" position={Position.Right} style={{ background:'#ff26c5' }}/>
      <div className="flex items-center justify-center gap-1"><GitMerge size={12} className="text-plasma-400"/><span className="text-xs font-semibold text-plasma-300">Merge</span></div>
    </div>
  )
}

const nodeTypes: NodeTypes = { agent:AgentNode, input:InputNode, output:OutputNode, merge:MergeNode }

// ── PipelinePanel ────────────────────────────────────────────────────────────
export function PipelinePanel() {
  const { agents } = useStore()
  const [running, setRunning] = useState(false)
  const [log,     setLog]     = useState<string[]>([])

  const initialNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [
      { id:'input',  type:'input',  position:{ x:50, y:180 }, data:{ label:'Task Input' } },
      { id:'output', type:'output', position:{ x:560, y:180 }, data:{ label:'Final Output' } },
    ]
    agents.forEach((a, i) => {
      nodes.push({
        id:   a.id,
        type: 'agent',
        position: { x:220, y:50 + i * 140 },
        data: { label:a.name, agentId:a.id },
      })
    })
    if (agents.length > 1) {
      nodes.push({ id:'merge', type:'merge', position:{ x:420, y:150 + (agents.length-1)*35 }, data:{} })
    }
    return nodes
  }, [agents])

  const initialEdges: Edge[] = useMemo(() => {
    const es: Edge[] = []
    agents.forEach(a => {
      es.push({ id:`input->${a.id}`, source:'input', target:a.id, animated:false, style:{stroke:'#6355fa50'} })
      if (agents.length > 1) {
        es.push({ id:`${a.id}->merge`, source:a.id, target:'merge', style:{stroke:'#ff26c530'} })
      } else {
        es.push({ id:`${a.id}->output`, source:a.id, target:'output', style:{stroke:'#00ff8830'} })
      }
    })
    if (agents.length > 1) {
      es.push({ id:'merge->output', source:'merge', target:'output', style:{stroke:'#00ff8830'} })
    }
    return es
  }, [agents])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const onConnect = useCallback((c: Connection) => setEdges(es => addEdge({ ...c, animated:true }, es)), [setEdges])

  const runPipeline = async () => {
    if (agents.length === 0) { setLog(['No agents to run']); return }
    setRunning(true)
    setLog(['🚀 Starting pipeline…'])
    try {
      for (const agent of agents) {
        setLog(l => [...l, `▶ Starting agent: ${agent.name}`])
        await ipc.agents.start(agent.id)
      }
      setLog(l => [...l, '✓ Pipeline started — agents are running'])
    } catch (e: unknown) {
      setLog(l => [...l, `❌ Error: ${e instanceof Error ? e.message : String(e)}`])
    } finally {
      setRunning(false)
    }
  }

  const stopPipeline = async () => {
    for (const agent of agents) await ipc.agents.stop(agent.id)
    setLog(l => [...l, '⏹ Pipeline stopped'])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution:true }}
        >
          <Background color="#1a1c21" gap={32} size={1}/>
          <Controls style={{ background:'#111317', border:'1px solid #22242a', borderRadius:8 }} showInteractive={false}/>
          <MiniMap style={{ background:'#111317', border:'1px solid #22242a' }}
            nodeColor={n => agents.find(a => a.id === n.id)?.status === 'running' ? '#00ff88' : '#6355fa'}/>
          <Panel position="top-left">
            <div className="flex items-center gap-2 bg-carbon-950/90 border border-carbon-800 px-3 py-1.5 rounded-lg backdrop-blur-sm">
              <GitMerge size={12} className="text-void-400"/>
              <span className="text-xs text-carbon-300 font-medium">Agent Pipeline</span>
              <span className="text-xs text-carbon-600">{agents.length} agents</span>
            </div>
          </Panel>
          <Panel position="top-right">
            <div className="flex gap-2">
              <button onClick={runPipeline} disabled={running || agents.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-signal-green/20 border border-signal-green/30 text-signal-green rounded-lg text-xs font-medium hover:bg-signal-green/30 transition-colors disabled:opacity-40">
                <Play size={11}/>{running ? 'Running…' : 'Run Pipeline'}
              </button>
              {running && (
                <button onClick={stopPipeline}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-signal-red/20 border border-signal-red/30 text-signal-red rounded-lg text-xs font-medium hover:bg-signal-red/30 transition-colors">
                  <Square size={11}/>Stop
                </button>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Execution log */}
      {log.length > 0 && (
        <div className="flex-shrink-0 border-t border-carbon-900 bg-carbon-975 max-h-32 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-carbon-900">
            <span className="text-xs text-carbon-500 font-semibold">Execution Log</span>
            <button onClick={() => setLog([])} className="text-carbon-700 hover:text-carbon-400 text-xs">Clear</button>
          </div>
          <div className="p-2 space-y-0.5">
            {log.map((line, i) => (
              <div key={i} className="text-xs font-mono text-carbon-400">{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
