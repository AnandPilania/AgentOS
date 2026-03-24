import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { Search, ArrowRight, X, Loader } from 'lucide-react'
import type { SearchResult } from '../../../shared/types'

export function GlobalSearch() {
  const store = useStore()
  const { toggleSearch, agents, workspaces, templates, setSearchResults, searchResults, selectAgent, setActivePanel } = store
  const [query, setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setLoading(true)
    try {
      const results = await ipc.invoke?.('search:query', { query: q, limit: 30 }) as SearchResult[]
      setSearchResults(results ?? [])
    } catch {
      const local: SearchResult[] = []
      agents.forEach(a => { if (a.name.toLowerCase().includes(q.toLowerCase())) local.push({ type:'agent', id:a.id, title:a.name, excerpt:`${a.provider} / ${a.model}`, score:1 }) })
      workspaces.forEach(ws => { if (ws.name.toLowerCase().includes(q.toLowerCase())) local.push({ type:'workspace', id:ws.id, title:ws.name, excerpt:ws.path, score:0.8 }) })
      templates.forEach(t => { if (t.name.toLowerCase().includes(q.toLowerCase())) local.push({ type:'template', id:t.id, title:t.name, excerpt:t.description, score:0.7 }) })
      setSearchResults(local)
    } finally { setLoading(false) }
  }, [agents, workspaces, templates])

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doSearch(query), 200)
    return () => clearTimeout(debounce.current)
  }, [query, doSearch])

  const handleResult = (r: SearchResult) => {
    if (r.type === 'agent') { selectAgent(r.id); setActivePanel('chat') }
    else if (r.type === 'message' && r.agentId) { selectAgent(r.agentId); setActivePanel('chat') }
    else if (r.type === 'template') setActivePanel('templates')
    else if (r.type === 'workspace') { useStore.getState().selectWorkspace(r.id); setActivePanel('files') }
    toggleSearch()
  }

  const TYPE_ICON: Record<string, React.ReactNode> = {
    message:'💬', file:'📄', agent:'🤖', workspace:'📁', template:'✨',
  }

  const grouped = searchResults.reduce((acc, r) => { if (!acc[r.type]) acc[r.type] = []; acc[r.type].push(r); return acc }, {} as Record<string, SearchResult[]>)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm" onClick={toggleSearch}>
      <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.15}}
        className="w-full max-w-2xl mx-4 panel overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()} style={{maxHeight:'70vh'}}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-carbon-800">
          {loading ? <Loader size={15} className="text-carbon-500 animate-spin" /> : <Search size={15} className="text-carbon-500" />}
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search agents, messages, files, templates…"
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-carbon-500 selectable"
            onKeyDown={e => { if (e.key==='Escape') toggleSearch(); if (e.key==='Enter' && searchResults[0]) handleResult(searchResults[0]) }} />
          {query && <button onClick={() => setQuery('')} className="text-carbon-600 hover:text-carbon-300"><X size={13} /></button>}
          <kbd className="text-xs text-carbon-700 bg-carbon-900 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        <div className="overflow-y-auto" style={{maxHeight:'calc(70vh - 60px)'}}>
          {query && searchResults.length === 0 && !loading && (
            <div className="text-center py-12 text-carbon-600"><Search size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No results for "{query}"</p></div>
          )}
          {Object.entries(grouped).map(([type, results]) => (
            <div key={type} className="py-2">
              <p className="text-xs text-carbon-600 font-semibold uppercase tracking-wide px-5 py-1">{type} ({results.length})</p>
              {results.map(r => (
                <button key={r.id} onClick={() => handleResult(r)} className="w-full flex items-start gap-3 px-5 py-2.5 hover:bg-carbon-925 transition-colors group text-left">
                  <span className="text-sm flex-shrink-0">{TYPE_ICON[r.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-carbon-200 font-medium truncate">{r.title}</div>
                    <div className="text-xs text-carbon-500 truncate mt-0.5">{r.excerpt}</div>
                  </div>
                  <ArrowRight size={13} className="text-carbon-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          ))}
          {!query && (
            <div className="p-3">
              <p className="text-xs text-carbon-600 font-semibold uppercase tracking-wide px-2 mb-2">Quick Actions</p>
              {[
                { label:'New Agent', action: () => { toggleSearch(); useStore.getState().toggleNewAgent() } },
                { label:'Open MCP Panel', action: () => { toggleSearch(); setActivePanel('mcp') } },
                { label:'View Cost Dashboard', action: () => { toggleSearch(); setActivePanel('cost') } },
                { label:'Browse Templates', action: () => { toggleSearch(); setActivePanel('templates') } },
              ].map(a => (
                <button key={a.label} onClick={a.action} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-carbon-900 text-left transition-colors">
                  <ArrowRight size={12} className="text-carbon-600" />
                  <span className="text-sm text-carbon-400">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
