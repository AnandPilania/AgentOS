import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { Search, Star, Download, BadgeCheck, Sparkles, Bot } from 'lucide-react'
import type { AgentTemplate, TemplateCategory } from '../../../shared/types'

const CATEGORIES: { id: TemplateCategory | 'all'; label: string }[] = [
  { id:'all',      label:'All'       },
  { id:'coding',   label:'Coding'    },
  { id:'testing',  label:'Testing'   },
  { id:'devops',   label:'DevOps'    },
  { id:'data',     label:'Data'      },
  { id:'research', label:'Research'  },
  { id:'writing',  label:'Writing'   },
  { id:'analysis', label:'Analysis'  },
]

export function TemplatesPanel({ paneId }: { paneId?: string }) {
  const { templates, setTemplates, upsertAgent, workspaces, agents } = useStore()
  const [query,    setQuery]    = useState('')
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
  const [selected, setSelected] = useState<AgentTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    ipc.invoke?.('templates:list').then((d: unknown) => setTemplates((d ?? []) as import('../../../shared/types').AgentTemplate[])).catch(console.error)
  }, [])

  const filtered = templates.filter(t =>
    (category === 'all' || t.category === category) &&
    (!query || t.name.toLowerCase().includes(query.toLowerCase()) || t.description.toLowerCase().includes(query.toLowerCase()) || t.tags.some(tag => tag.includes(query.toLowerCase())))
  )

  const useTemplate = async (template: AgentTemplate) => {
    setCreating(true)
    try {
      await ipc.invoke?.('templates:install', template.id)
      const ws = workspaces[0]
      if (!ws) return
      const agentRaw = await ipc.agents.create({
        name:        template.name,
        provider:    template.provider,
        model:       template.model,
        workspaceId: ws.id,
        prompt:      template.prompt,
        tools:       template.tools,
        tags:        [...template.tags, 'from-template'],
        templateId:  template.id,
      })
      const agent = agentRaw as import('../../../shared/types').Agent
      upsertAgent(agent)
      setSelected(null)
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header justify-between px-4">
        <span className="flex items-center gap-2"><Sparkles size={13} className="text-plasma-400" />Templates</span>
        <span className="text-xs text-carbon-500">{templates.length} available</span>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-carbon-900">
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon-500" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="selectable w-full bg-carbon-950 border border-carbon-800 rounded-lg pl-8 pr-3 py-2 text-xs text-carbon-200 placeholder-carbon-600 outline-none focus:border-void-500 transition-colors" />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-carbon-900 flex-shrink-0">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            className={`px-2.5 py-1 rounded-full text-xs flex-shrink-0 transition-colors ${
              category === cat.id ? 'bg-void-500/20 border border-void-500/40 text-void-300' : 'text-carbon-500 hover:text-carbon-300 border border-transparent'
            }`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template list / detail */}
      <div className="flex-1 overflow-hidden flex">
        {/* List */}
        <div className={`overflow-y-auto ${selected ? 'w-44 border-r border-carbon-900 flex-shrink-0' : 'flex-1'}`}>
          <div className="p-2 space-y-1.5">
            {filtered.map(template => (
              <motion.button
                key={template.id}
                layout
                onClick={() => setSelected(template)}
                className={`w-full text-left p-3 rounded-xl border transition-all group ${
                  selected?.id === template.id
                    ? 'border-void-500/40 bg-void-500/10'
                    : 'border-carbon-800 bg-carbon-950 hover:border-carbon-600'
                }`}
              >
                {selected ? (
                  /* Compact mode */
                  <div className="flex items-center gap-2">
                    <Bot size={11} className="text-void-400 flex-shrink-0" />
                    <span className="text-xs text-carbon-300 truncate">{template.name}</span>
                  </div>
                ) : (
                  /* Full card */
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {template.verified && <BadgeCheck size={12} className="text-signal-blue" />}
                        <span className="text-xs font-semibold text-carbon-200">{template.name}</span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[template.category] ?? 'bg-carbon-900 text-carbon-500'}`}>
                        {template.category}
                      </span>
                    </div>
                    <p className="text-xs text-carbon-500 line-clamp-2 mb-2">{template.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 flex-wrap">
                        {template.tags.slice(0,3).map(t => (
                          <span key={t} className="text-xs bg-carbon-900 border border-carbon-800 px-1.5 py-0.5 rounded-full text-carbon-500">{t}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-carbon-600 flex-shrink-0">
                        <span className="flex items-center gap-0.5"><Star size={9} />{template.rating.toFixed(1)}</span>
                        <span className="flex items-center gap-0.5"><Download size={9} />{template.downloads}</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.button>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-10 text-carbon-600">
                <Sparkles size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No templates match "{query}"</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  {selected.verified && <BadgeCheck size={14} className="text-signal-blue" />}
                  <h3 className="font-display font-bold text-white text-sm">{selected.name}</h3>
                </div>
                <p className="text-xs text-carbon-400">{selected.description}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-carbon-600 hover:text-white ml-2">×</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoPill label="Provider" value={selected.provider} />
              <InfoPill label="Model"    value={selected.model.split('-').slice(1,3).join('-')} />
              <InfoPill label="Tools"    value={String(selected.tools.length)} />
              <InfoPill label="Author"   value={selected.author} />
            </div>

            {/* Tools */}
            <div>
              <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-1.5">Tools Enabled</p>
              <div className="flex flex-wrap gap-1">
                {selected.tools.map(t => (
                  <span key={t} className="text-xs bg-carbon-900 border border-carbon-800 px-1.5 py-0.5 rounded font-mono text-carbon-400">{t}</span>
                ))}
              </div>
            </div>

            {/* Prompt preview */}
            <div>
              <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-1.5">System Prompt</p>
              <div className="bg-carbon-950 border border-carbon-900 rounded-lg p-3 text-xs text-carbon-400 font-mono leading-relaxed max-h-40 overflow-y-auto selectable whitespace-pre-wrap">
                {selected.prompt}
              </div>
            </div>

            <button
              onClick={() => useTemplate(selected)}
              disabled={creating || workspaces.length === 0}
              className="w-full py-2.5 bg-void-500 hover:bg-void-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {creating ? 'Creating…' : (<><Sparkles size={14} /> Use Template</>)}
            </button>

            {workspaces.length === 0 && (
              <p className="text-xs text-signal-yellow text-center">Create a workspace first</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-carbon-950 border border-carbon-900 rounded-lg px-2 py-1.5">
      <div className="text-xs text-carbon-600">{label}</div>
      <div className="text-xs font-mono text-carbon-300 truncate">{value}</div>
    </div>
  )
}

const CATEGORY_COLORS: Record<string, string> = {
  coding:   'bg-void-500/20 text-void-300',
  testing:  'bg-signal-green/20 text-signal-green',
  devops:   'bg-signal-orange/20 text-signal-orange',
  data:     'bg-signal-blue/20 text-signal-blue',
  research: 'bg-plasma-500/20 text-plasma-300',
  writing:  'bg-signal-yellow/20 text-signal-yellow',
  analysis: 'bg-void-400/20 text-void-300',
  custom:   'bg-carbon-800 text-carbon-400',
}
