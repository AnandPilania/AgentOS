import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { Send, Bot, User, Loader, Copy, Check, Wrench, ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentMessage, ToolCall } from '../../../shared/types'

export function ChatPanel({ paneId }: { paneId?: string }) {
  const { agents, messages, streams, ui, appendMessage, setMessages } = useStore()
  const pane  = paneId ? ui.paneConfig.panes.find(p => p.id === paneId) : null
  const agentId = pane?.agentId ?? ui.selectedAgentId
  const agent = agents.find(a => a.id === agentId)
  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textRef   = useRef<HTMLTextAreaElement>(null)
  const agentMessages = agent ? (messages[agent.id] ?? []) : []
  const stream        = agent ? streams[agent.id] : undefined

  useEffect(() => {
    if (!agent) return
    ipc.agents.getMessages(agent.id).then(d => setMessages(agent.id, d as import('../../../shared/types').AgentMessage[])).catch(console.error)
  }, [agent?.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [agentMessages.length, stream?.buffer])

  const send = useCallback(async () => {
    if (!agent || !input.trim() || sending) return
    const text = input.trim(); setInput(''); setSending(true)
    try { await ipc.agents.sendMessage(agent.id, text) }
    catch (err) { console.error(err) }
    finally { setSending(false) }
  }, [agent, input, sending])

  const autoResize = () => {
    if (textRef.current) { textRef.current.style.height='auto'; textRef.current.style.height=`${Math.min(textRef.current.scrollHeight, 160)}px` }
  }

  if (!agent) return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-carbon-975">
      <Bot size={32} className="text-carbon-700 mb-3"/>
      <p className="text-sm text-carbon-500">{agents.length===0 ? 'Create an agent to start' : 'Select an agent'}</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-carbon-975">
      <div className="panel-header px-4 flex-shrink-0">
        <span className={`status-dot ${agent.status}`}/>
        <span className="font-display text-white font-semibold text-xs">{agent.name}</span>
        <span className="text-carbon-600 text-xs ml-auto font-mono">{agent.provider}/{agent.model.split('-').slice(-2).join('-')}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 selectable">
        <AnimatePresence initial={false}>
          {agentMessages.map(msg => <MessageBubble key={msg.id} message={msg}/>)}
        </AnimatePresence>
        {stream && (
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex gap-2">
            <div className="w-6 h-6 rounded-lg bg-void-500/20 border border-void-500/30 flex items-center justify-center flex-shrink-0"><Bot size={11} className="text-void-400"/></div>
            <div className="flex-1 bg-carbon-925 border border-carbon-800 rounded-xl rounded-tl-sm px-3 py-2 max-w-3xl">
              <p className="text-xs text-carbon-200 leading-relaxed font-mono whitespace-pre-wrap">{stream.buffer}<span className="inline-block w-1.5 h-3.5 bg-void-400 ml-0.5 animate-pulse"/></p>
            </div>
          </motion.div>
        )}
        {sending && !stream && <div className="flex items-center gap-2 text-carbon-600"><Loader size={11} className="animate-spin"/><span className="text-xs">Waiting…</span></div>}
        <div ref={bottomRef}/>
      </div>
      <div className="flex-shrink-0 border-t border-carbon-900 p-2.5">
        <div className="flex gap-2 items-end bg-carbon-950 border border-carbon-800 focus-within:border-void-500/60 rounded-xl transition-colors p-2">
          <textarea ref={textRef} value={input} onChange={e=>{setInput(e.target.value);autoResize()}}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
            placeholder="Message… (Enter to send, Shift+Enter for newline)" rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-xs text-carbon-100 placeholder-carbon-600 selectable leading-relaxed py-1 px-1 font-mono" style={{minHeight:28}}/>
          <button onClick={send} disabled={!input.trim()||sending}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-void-500 hover:bg-void-400 disabled:opacity-40 transition-colors flex-shrink-0">
            {sending ? <Loader size={11} className="animate-spin text-white"/> : <Send size={11} className="text-white"/>}
          </button>
        </div>
        <p className="text-xs text-carbon-700 mt-1 text-center font-mono">
          {agent.stats.turns} turns · {(agent.stats.tokensIn+agent.stats.tokensOut).toLocaleString()} tokens · ${agent.stats.cost.toFixed(5)}
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const [copied, setCopied] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const isUser = message.role === 'user'
  const copy = () => { navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(()=>setCopied(false), 1500) }
  const hasTools = message.toolCalls && message.toolCalls.length > 0
  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className={`flex gap-2 group ${isUser?'flex-row-reverse':''}`}>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser?'bg-plasma-500/20 border border-plasma-500/30':'bg-void-500/20 border border-void-500/30'}`}>
        {isUser ? <User size={11} className="text-plasma-400"/> : <Bot size={11} className="text-void-400"/>}
      </div>
      <div className={`flex-1 max-w-2xl flex flex-col gap-1 ${isUser?'items-end':'items-start'}`}>
        <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed relative ${isUser?'bg-void-500/15 border border-void-500/20 text-carbon-100 rounded-tr-sm':'bg-carbon-925 border border-carbon-800 text-carbon-200 rounded-tl-sm'}`}>
          <p className="font-mono whitespace-pre-wrap selectable">{message.content}</p>
          <button onClick={copy} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-carbon-600 hover:text-carbon-200 hover:bg-carbon-800">
            {copied ? <Check size={9} className="text-signal-green"/> : <Copy size={9}/>}
          </button>
        </div>
        {hasTools && (
          <button onClick={()=>setShowTools(v=>!v)} className="flex items-center gap-1 text-xs text-carbon-600 hover:text-carbon-400 transition-colors">
            <Wrench size={9}/> {message.toolCalls!.length} tool call{message.toolCalls!.length>1?'s':''}
            {showTools ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
          </button>
        )}
        {showTools && message.toolCalls && (
          <div className="space-y-1 w-full">
            {message.toolCalls.map(tc => <ToolCallBadge key={tc.id} tc={tc}/>)}
          </div>
        )}
        <span className="text-xs text-carbon-700">{new Date(message.timestamp).toLocaleTimeString()}</span>
      </div>
    </motion.div>
  )
}

function ToolCallBadge({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false)
  const statusColor = { done:'text-signal-green', error:'text-signal-red', running:'text-signal-yellow', pending:'text-carbon-500' }[tc.status]
  return (
    <div className="bg-carbon-950 border border-carbon-900 rounded-lg overflow-hidden">
      <button onClick={()=>setOpen(v=>!v)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
        <Wrench size={10} className="text-carbon-600 flex-shrink-0"/>
        <span className="text-xs font-mono text-carbon-300 flex-1">{tc.name}</span>
        <span className={`text-xs font-mono ${statusColor}`}>{tc.status}</span>
        {open ? <ChevronDown size={9} className="text-carbon-600"/> : <ChevronRight size={9} className="text-carbon-600"/>}
      </button>
      {open && (
        <div className="border-t border-carbon-900 px-2.5 py-2">
          <pre className="text-xs text-carbon-400 font-mono whitespace-pre-wrap selectable">{JSON.stringify(tc.input, null, 2)}</pre>
          {tc.error && <p className="text-xs text-signal-red mt-1">{tc.error}</p>}
        </div>
      )}
    </div>
  )
}
