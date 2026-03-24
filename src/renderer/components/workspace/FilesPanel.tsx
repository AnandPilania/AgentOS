import React, { useEffect, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { FolderOpen, Folder, FileCode, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'

interface FileNode {
  name: string; path: string; type: 'file' | 'directory'
  children?: FileNode[]; size?: number
}

export function FilesPanel() {
  const { agents, workspaces, ui } = useStore()
  const agent = agents.find(a => a.id === ui.selectedAgentId)
  const ws    = workspaces.find(w => w.id === (agent?.workspaceId ?? ui.selectedWsId))

  const [tree,       setTree]       = useState<FileNode[]>([])
  const [openFile,   setOpenFile]   = useState<string | null>(null)
  const [content,    setContent]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [loadingFile,setLoadingFile] = useState(false)
  const [modified,   setModified]   = useState(false)

  const refreshTree = useCallback(async () => {
    if (!ws) return
    setLoading(true)
    try {
      const files = await ipc.workspaces.files(ws.id) as FileNode[]
      setTree(files)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [ws?.id])

  useEffect(() => { refreshTree() }, [ws?.id])

  const openFileHandler = useCallback(async (path: string) => {
    if (!ws) return
    setLoadingFile(true)
    setOpenFile(path)
    try {
      const text = await ipc.workspaces.readFile(ws.id, path) as string
      setContent(text)
      setModified(false)
    } catch (e) { setContent('// Error reading file') }
    finally { setLoadingFile(false) }
  }, [ws?.id])

  const save = useCallback(async () => {
    if (!ws || !openFile) return
    await ipc.workspaces.writeFile(ws.id, openFile, content)
    setModified(false)
  }, [ws?.id, openFile, content])

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop() ?? ''
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
      json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', sh: 'shell',
      css: 'css', html: 'html', sql: 'sql', toml: 'toml',
    }
    return map[ext] ?? 'plaintext'
  }

  if (!ws) return (
    <div className="flex items-center justify-center h-full text-carbon-500">
      <div className="text-center">
        <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Select a workspace to browse files</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-52 flex-shrink-0 border-r border-carbon-900 flex flex-col">
        <div className="panel-header justify-between">
          <span className="flex items-center gap-1"><FolderOpen size={11} />{ws.name}</span>
          <button onClick={refreshTree} className="text-carbon-500 hover:text-white transition-colors">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {tree.map(node => (
            <TreeNode key={node.path} node={node} depth={0} onOpen={openFileHandler} activeFile={openFile ?? ''} />
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {openFile ? (
          <>
            {/* Editor tab */}
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-carbon-900 bg-carbon-950 text-xs">
              <FileCode size={11} className="text-void-400" />
              <span className="text-carbon-300 font-mono">{openFile}</span>
              {modified && <span className="text-signal-yellow ml-auto">● modified</span>}
              {modified && (
                <button
                  onClick={save}
                  className="ml-2 text-xs bg-void-500/20 hover:bg-void-500/30 text-void-300 px-2 py-0.5 rounded transition-colors"
                >
                  Save (⌘S)
                </button>
              )}
            </div>

            {loadingFile ? (
              <div className="flex-1 flex items-center justify-center text-carbon-500 text-sm">Loading…</div>
            ) : (
              <Editor
                className="flex-1"
                language={getLanguage(openFile)}
                value={content}
                onChange={v => { setContent(v ?? ''); setModified(true) }}
                theme="vs-dark"
                options={{
                  fontSize:         13,
                  fontFamily:       "'JetBrains Mono', monospace",
                  minimap:          { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap:         'on',
                  lineNumbers:      'on',
                  renderWhitespace: 'selection',
                  smoothScrolling:  true,
                  cursorSmoothCaretAnimation: 'on',
                  padding:          { top: 12, bottom: 12 },
                }}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-carbon-600 text-sm">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  )
}

function TreeNode({ node, depth, onOpen, activeFile }: {
  node: FileNode; depth: number; onOpen: (p: string) => void; activeFile: string
}) {
  const [open, setOpen] = useState(depth < 1)
  const isActive = node.path === activeFile

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 w-full px-2 py-1 hover:bg-carbon-900 transition-colors text-xs text-carbon-400 hover:text-carbon-200"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {open ? <FolderOpen size={11} className="text-signal-yellow/70" /> : <Folder size={11} className="text-signal-yellow/70" />}
          <span>{node.name}</span>
        </button>
        {open && node.children?.map(child => (
          <TreeNode key={child.path} node={child} depth={depth + 1} onOpen={onOpen} activeFile={activeFile} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onOpen(node.path)}
      className={`flex items-center gap-1.5 w-full px-2 py-1 transition-colors text-xs ${
        isActive ? 'bg-void-500/15 text-white' : 'text-carbon-500 hover:text-carbon-300 hover:bg-carbon-925'
      }`}
      style={{ paddingLeft: 20 + depth * 12 }}
    >
      <FileCode size={10} className={isActive ? 'text-void-400' : 'text-carbon-700'} />
      <span className="truncate font-mono">{node.name}</span>
    </button>
  )
}
