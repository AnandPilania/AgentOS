import React, { useMemo, useCallback } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Panel, addEdge, useNodesState, useEdgesState, type Node, type Edge, type Connection, type NodeTypes, Position, Handle } from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../../store'
import { Bot, GitMerge, Zap, Play, Square } from 'lucide-react'
import { ipc } from '../../hooks/useIPC'

function AgentNode({ data }: { data: { agent: ReturnType<typeof useStore.getState>['agents'][0] } }) {
  const statusColor: Record<string,string> = { running:'#00ff88', idle:'#636874', error:'#ff3355', paused:'#ffdd00', done:'#6355fa', waiting:'#00aaff', queued:'#ff7700' }
  return (
    <div className={`bg-carbon-925 border rounded-xl p-3 w-44 shadow-agent ${data.agent.status==='running'?'border-signal-green/40':'border-carbon-700'}`}>
      <Handle type="target" position={Position.Left}  style={{background:'#6355fa'}}/>
      <Handle type="source" position={Position.Right} style={{background:'#6355fa'}}/>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-void-500/20 flex items-center justify-center"><Bot size={11} className="text-void-400"/></div>
        <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-white truncate">{data.agent.name}</div><div className="text-xs text-carbon-500 truncate font-mono">{data.agent.model.split('-').slice(-2).join('-')}</div></div>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:statusColor[data.agent.status]}}/>
      </div>
      <div className="flex gap-1">
        {data.agent.status==='running'
          ? <button onClick={()=>ipc.agents.stop(data.agent.id)} className="flex-1 text-xs bg-signal-red/20 text-signal-red rounded py-0.5 flex items-center justify-center gap-0.5"><Square size={9}/>Stop</button>
          : <button onClick={()=>ipc.agents.start(data.agent.id)} className="flex-1 text-xs bg-signal-green/20 text-signal-green rounded py-0.5 flex items-center justify-center gap-0.5"><Play size={9}/>Start</button>}
      </div>
    </div>
  )
}

function MergeNode() {
  return (
    <div className="bg-carbon-925 border border-plasma-500/30 rounded-xl p-3 w-28 text-center">
      <Handle type="target" position={Position.Left}  style={{background:'#ff26c5'}}/>
      <Handle type="source" position={Position.Right} style={{background:'#ff26c5'}}/>
      <div className="flex items-center justify-center gap-1"><GitMerge size={13} className="text-plasma-400"/><span className="text-xs font-semibold text-plasma-300">Merge</span></div>
    </div>
  )
}

function InputNode({ data }: { data: {label:string} }) {
  return (
    <div className="bg-carbon-925 border border-carbon-700 rounded-xl px-3 py-2">
      <Handle type="source" position={Position.Right} style={{background:'#6355fa'}}/>
      <div className="flex items-center gap-1.5"><Zap size={12} className="text-signal-yellow"/><span className="text-xs font-medium text-carbon-300">{data.label??'Input'}</span></div>
    </div>
  )
}

const nodeTypes: NodeTypes = { agent:AgentNode, merge:MergeNode, input:InputNode }

export function GraphPanel() {
  const { agents } = useStore()
  const initialNodes: Node[] = useMemo(()=>{
    const ns: Node[] = [{id:'input',type:'input',position:{x:50,y:200+(agents.length-1)*70},data:{label:'Task'}}]
    agents.forEach((a,i) => ns.push({id:a.id,type:'agent',position:{x:260,y:50+i*140},data:{agent:a}}))
    if (agents.length>1) ns.push({id:'merge',type:'merge',position:{x:500,y:50+(agents.length-1)*70},data:{}})
    return ns
  }, [agents])
  const initialEdges: Edge[] = useMemo(()=>{
    const es: Edge[] = []
    agents.forEach(a => {
      es.push({id:`i->${a.id}`,source:'input',target:a.id,animated:a.status==='running',style:{stroke:'#6355fa50'}})
      if (agents.length>1) es.push({id:`${a.id}->m`,source:a.id,target:'merge',style:{stroke:'#ff26c530'}})
    })
    return es
  }, [agents])
  const [nodes,,onNodesChange] = useNodesState(initialNodes)
  const [edges,setEdges,onEdgesChange] = useEdgesState(initialEdges)
  const onConnect = useCallback((c:Connection)=>setEdges(es=>addEdge({...c,animated:true},es)),[])
  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView proOptions={{hideAttribution:true}}>
        <Background color="#1a1c21" gap={32} size={1}/>
        <Controls style={{background:'#111317',border:'1px solid #22242a',borderRadius:8}} showInteractive={false}/>
        <MiniMap style={{background:'#111317',border:'1px solid #22242a'}} nodeColor={n=>agents.find(a=>a.id===n.id)?.status==='running'?'#00ff88':'#6355fa'}/>
        <Panel position="top-left"><div className="flex items-center gap-2 bg-carbon-950/80 border border-carbon-800 px-3 py-1.5 rounded-lg text-xs text-carbon-400 backdrop-blur-sm">Agent Graph · {agents.length} agents</div></Panel>
      </ReactFlow>
    </div>
  )
}
