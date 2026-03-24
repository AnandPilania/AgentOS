import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { X, Bot, Sparkles, Wrench } from 'lucide-react'
import type { AIProvider, BuiltinTool, AgentTemplate } from '../../../shared/types'

const PROVIDERS: {id:AIProvider;label:string;models:string[]}[] = [
  {id:'anthropic',label:'Anthropic',models:['claude-opus-4-5','claude-sonnet-4-5','claude-haiku-4-5-20251001']},
  {id:'openai',   label:'OpenAI',   models:['gpt-4o','gpt-4o-mini','o1-preview']},
  {id:'gemini',   label:'Gemini',   models:['gemini-1.5-pro','gemini-1.5-flash']},
  {id:'ollama',   label:'Ollama',   models:['qwen:0.5b', 'phi4-mini:latest', 'qwen2.5-coder:1.5b-instruct ','llama3.1:8b','qwen2.5-coder:1.5b-base','mistral:latest', 'tinyllama:1.1b-chat', 'codellama:latest', 'phi4:14b-q4_K_M', 'deepseek-r1:1.5b']},
]
const ALL_TOOLS: BuiltinTool[] = ['read_file','write_file','list_files','bash','search_code','grep','git_status','git_diff','git_commit']

export function NewAgentModal() {
  const { workspaces, templates, upsertAgent, toggleNewAgent } = useStore()
  const [tab, setTab] = useState<'blank'|'template'>('template')
  const [name, setName]         = useState('')
  const [provider, setProvider] = useState<AIProvider>('anthropic')
  const [model, setModel]       = useState('claude-sonnet-4-5')
  const [wsId, setWsId]         = useState(workspaces[0]?.id??'')
  const [prompt, setPrompt]     = useState('')
  const [tools, setTools]       = useState<BuiltinTool[]>(['read_file','write_file','list_files','bash','search_code','git_status','git_diff'])
  const [selTpl, setSelTpl]     = useState<AgentTemplate|null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const prov = PROVIDERS.find(p=>p.id===provider)!

  const applyTemplate = (t: AgentTemplate) => {
    setSelTpl(t); setName(t.name); setProvider(t.provider); setModel(t.model); setPrompt(t.prompt); setTools(t.tools); setTab('blank')
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if(!name.trim()){setError('Name required');return}
    setLoading(true); setError('')
    try {
      if (selTpl) await ipc.invoke?.('templates:install', selTpl.id)
      const agentRaw = await ipc.agents.create({ name:name.trim(), provider, model, workspaceId:wsId||workspaces[0]?.id||'', prompt:prompt||undefined, tools, tags:[provider], templateId:selTpl?.id })
      const agent = agentRaw as import('../../../shared/types').Agent
      upsertAgent(agent)
      // Auto-select and init pane for the new agent
      useStore.getState().selectAgent(agent.id)
      const store = useStore.getState()
      if (store.ui.paneConfig.panes.length === 0) {
        store.setPaneLayout('single')
        store.setPaneConfig({ panes: [{ id: crypto.randomUUID(), agentId: agent.id, panel: 'chat', size: 100, position: 0 }] })
        store.setActivePaneId(store.ui.paneConfig.panes[0]?.id ?? null)
      }
      toggleNewAgent()
    } catch(err:unknown){setError(err instanceof Error?err.message:'Failed')} finally{setLoading(false)}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} className="panel w-full max-w-lg mx-4 overflow-hidden" style={{maxHeight:'85vh'}}>
        <div className="panel-header justify-between px-5 py-3.5">
          <span className="flex items-center gap-2 text-sm font-bold text-white"><Bot size={13} className="text-void-400"/>New Agent</span>
          <button onClick={toggleNewAgent} className="text-carbon-500 hover:text-white transition-colors"><X size={14}/></button>
        </div>

        {/* Tab */}
        <div className="flex border-b border-carbon-900">
          {([['template','From Template'],['blank','Blank Agent']] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} className={`flex-1 py-2 text-xs font-medium transition-colors ${tab===id?'text-white border-b-2 border-void-500':'text-carbon-500 hover:text-carbon-300'}`}>{label}</button>
          ))}
        </div>

        <div className="overflow-y-auto" style={{maxHeight:'calc(85vh - 120px)'}}>
          {tab==='template' ? (
            <div className="p-3 grid grid-cols-2 gap-2">
              {templates.slice(0,8).map(t=>(
                <button key={t.id} onClick={()=>applyTemplate(t)}
                  className={`text-left p-3 rounded-xl border transition-all ${selTpl?.id===t.id?'border-void-500/50 bg-void-500/10':'border-carbon-800 bg-carbon-950 hover:border-carbon-600'}`}>
                  <div className="text-xs font-semibold text-carbon-200 mb-1">{t.name}</div>
                  <div className="text-xs text-carbon-600 line-clamp-2">{t.description}</div>
                  <div className="text-xs text-carbon-700 mt-1 font-mono">{t.provider}</div>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={create} className="p-5 space-y-3">
              {selTpl && <div className="bg-void-500/10 border border-void-500/30 rounded-lg px-3 py-2 text-xs text-void-300 flex items-center gap-2"><Sparkles size={11}/>Using template: {selTpl.name}</div>}
              <F label="Name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Backend Refactor Agent" className="fi" required/></F>
              <div className="grid grid-cols-2 gap-2">
                <F label="Provider"><select value={provider} onChange={e=>{setProvider(e.target.value as AIProvider);setModel(PROVIDERS.find(p=>p.id===e.target.value)!.models[0])}} className="fi">{PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></F>
                <F label="Model"><select value={model} onChange={e=>setModel(e.target.value)} className="fi">{prov.models.map(m=><option key={m} value={m}>{m.split('-').slice(-2).join('-')}</option>)}</select></F>
              </div>
              {workspaces.length>0 && <F label="Workspace"><select value={wsId} onChange={e=>setWsId(e.target.value)} className="fi"><option value="">No workspace</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></F>}
              <F label="System Prompt"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} className="fi resize-none font-mono text-xs" placeholder="You are…"/></F>
              <F label="Tools">
                <div className="grid grid-cols-3 gap-1">
                  {ALL_TOOLS.map(t=>(
                    <label key={t} className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer border transition-colors text-xs ${tools.includes(t)?'border-void-500/40 bg-void-500/10 text-void-300':'border-carbon-800 text-carbon-500 hover:border-carbon-600'}`}>
                      <input type="checkbox" checked={tools.includes(t)} onChange={e=>{if(e.target.checked)setTools(p=>[...p,t]);else setTools(p=>p.filter(x=>x!==t))}} className="sr-only"/>
                      <Wrench size={9}/>{t.replace('_',' ')}
                    </label>
                  ))}
                </div>
              </F>
              {error && <div className="bg-signal-red/10 border border-signal-red/30 rounded px-3 py-2 text-signal-red text-xs">{error}</div>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={toggleNewAgent} className="flex-1 py-2 border border-carbon-700 text-carbon-400 hover:text-white rounded-lg text-xs transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-2 bg-void-500 hover:bg-void-400 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
                  {loading?'Creating…':(<><Sparkles size={11}/>Create Agent</>)}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
      <style>{`.fi{width:100%;background:#0a0b0d;border:1px solid #22242a;border-radius:8px;padding:7px 10px;font-size:12px;color:#e2e3e6;outline:none;transition:border-color .15s}.fi:focus{border-color:#6355fa60}.fi option{background:#111317}`}</style>
    </div>
  )
}

function F({label,children}:{label:string;children:React.ReactNode}) {
  return <div><label className="block text-xs font-medium text-carbon-400 mb-1">{label}</label>{children}</div>
}
