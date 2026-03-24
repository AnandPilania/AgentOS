import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { GitCompare, RefreshCw, GitCommit, Plus, Minus, FileCode } from 'lucide-react'
import type { FileDiff } from '../../../shared/types'

export function DiffPanel() {
  const { agents, workspaces, ui, diffs, setDiff } = useStore()
  const agent = agents.find(a => a.id === ui.selectedAgentId)
  const ws    = workspaces.find(w => w.id === (agent?.workspaceId ?? ui.selectedWsId))
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)
  const [commitMsg, setCommitMsg]       = useState('')
  const [committing, setCommitting]     = useState(false)

  const fileDiffs = ws ? (diffs[ws.id] ?? []) : []
  const current   = fileDiffs.find(d => d.path === selectedFile) ?? fileDiffs[0]

  const refresh = async () => {
    if (!ws) return
    setLoading(true)
    try {
      const d = await ipc.workspaces.diff(ws.id) as FileDiff[]
      setDiff(ws.id, d)
      if (d.length > 0 && !selectedFile) setSelectedFile(d[0].path)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [ws?.id])

  const commit = async () => {
    if (!ws || !commitMsg.trim()) return
    setCommitting(true)
    try {
      await ipc.workspaces.commit(ws.id, commitMsg)
      setCommitMsg('')
      await refresh()
    } catch (e) { console.error(e) }
    finally { setCommitting(false) }
  }

  if (!ws) return (
    <div className="flex items-center justify-center h-full text-carbon-500">
      <div className="text-center">
        <GitCompare size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Select a workspace to see diffs</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="w-56 flex-shrink-0 border-r border-carbon-900 flex flex-col">
        <div className="panel-header justify-between">
          <span className="flex items-center gap-1"><GitCompare size={11} />Changed Files</span>
          <button onClick={refresh} className="text-carbon-500 hover:text-white transition-colors">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {fileDiffs.length === 0 ? (
            <div className="text-center py-8 text-carbon-600 text-xs px-3">
              {loading ? 'Loading…' : 'No changes detected'}
            </div>
          ) : fileDiffs.map(diff => (
            <button
              key={diff.path}
              onClick={() => setSelectedFile(diff.path)}
              className={`w-full text-left px-3 py-2 hover:bg-carbon-925 transition-colors flex items-center gap-2 ${
                selectedFile === diff.path ? 'bg-carbon-925 border-r-2 border-void-500' : ''
              }`}
            >
              <span className={`text-xs font-mono font-bold flex-shrink-0 ${
                diff.type === 'added'   ? 'text-signal-green' :
                diff.type === 'deleted' ? 'text-signal-red'   : 'text-signal-yellow'
              }`}>
                {diff.type === 'added' ? 'A' : diff.type === 'deleted' ? 'D' : 'M'}
              </span>
              <span className="text-xs text-carbon-300 truncate font-mono" title={diff.path}>
                {diff.path.split('/').pop()}
              </span>
            </button>
          ))}
        </div>

        {/* Commit box */}
        <div className="border-t border-carbon-900 p-2">
          <div className="flex items-center gap-1 mb-1.5 text-xs text-carbon-500">
            <GitCommit size={10} />
            <span>Commit</span>
          </div>
          <input
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commit()}
            placeholder="Commit message…"
            className="selectable w-full bg-carbon-950 border border-carbon-800 rounded px-2 py-1.5 text-xs text-white placeholder-carbon-600 outline-none focus:border-void-500 transition-colors mb-1.5 font-mono"
          />
          <button
            onClick={commit}
            disabled={!commitMsg.trim() || committing}
            className="w-full bg-void-500/20 hover:bg-void-500/30 border border-void-500/30 text-void-300 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40"
          >
            {committing ? 'Committing…' : 'Commit All'}
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-xs selectable">
        {current ? (
          <DiffView diff={current} />
        ) : (
          <div className="flex items-center justify-center h-full text-carbon-600">
            <div className="text-center">
              <FileCode size={32} className="mx-auto mb-2 opacity-30" />
              <p>Select a file to view diff</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DiffView({ diff }: { diff: FileDiff }) {
  return (
    <div>
      {/* File header */}
      <div className="sticky top-0 bg-carbon-950 border-b border-carbon-900 px-4 py-2 flex items-center justify-between">
        <span className="text-carbon-300 font-mono text-xs">{diff.path}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-signal-green">
            <Plus size={10} /> {diff.additions}
          </span>
          <span className="flex items-center gap-1 text-signal-red">
            <Minus size={10} /> {diff.deletions}
          </span>
        </div>
      </div>

      {/* Chunks */}
      {diff.chunks.map((chunk, ci) => (
        <div key={ci}>
          {/* Chunk header */}
          <div className="bg-void-500/10 border-y border-void-500/20 px-4 py-1 text-void-400 text-xs">
            @@ -{chunk.oldStart},{chunk.oldLines} +{chunk.newStart},{chunk.newLines} @@
          </div>

          {/* Lines */}
          {chunk.lines.map((line, li) => (
            <div
              key={li}
              className={`flex px-0 group ${
                line.type === 'add' ? 'bg-signal-green/8' :
                line.type === 'del' ? 'bg-signal-red/8'   : ''
              }`}
            >
              <span className={`w-8 text-right pr-3 select-none flex-shrink-0 text-carbon-700 border-r ${
                line.type === 'add' ? 'border-signal-green/20' :
                line.type === 'del' ? 'border-signal-red/20'   : 'border-carbon-900'
              }`}>
                {line.lineNo ?? ''}
              </span>
              <span className={`px-3 w-4 flex-shrink-0 font-bold ${
                line.type === 'add' ? 'text-signal-green' :
                line.type === 'del' ? 'text-signal-red'   : 'text-carbon-700'
              }`}>
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </span>
              <span className={`px-1 flex-1 whitespace-pre ${
                line.type === 'add' ? 'text-signal-green/90' :
                line.type === 'del' ? 'text-signal-red/80'   : 'text-carbon-400'
              }`}>
                {line.content}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
