import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import {
  Bot, PlugZap, FolderGit2, Sparkles,
  ArrowRight, ArrowLeft, Check, Key
} from 'lucide-react'

type Step = 'welcome' | 'provider' | 'workspace' | 'template' | 'done'

const STEPS: Step[] = ['welcome', 'provider', 'workspace', 'template', 'done']

export function OnboardingFlow() {
  const { completeOnboarding, upsertAgent, upsertWorkspace } = useStore()
  const [step,       setStep]      = useState<Step>('welcome')
  const [apiKey,     setApiKey]    = useState('')
  const [provider,   setProvider]  = useState<import('../../../shared/types').AIProvider>('anthropic')
  const [wsPath,     setWsPath]    = useState('')
  const [template,   setTemplate]  = useState<'engineer'|'reviewer'|'skip'>('engineer')
  const [loading,    setLoading]   = useState(false)

  const stepIdx  = STEPS.indexOf(step)
  const progress = ((stepIdx) / (STEPS.length - 1)) * 100

  const next = () => setStep(STEPS[stepIdx + 1])
  const prev = () => setStep(STEPS[stepIdx - 1])

  const finish = async () => {
    setLoading(true)
    try {
      // Save API key
      if (apiKey.trim()) {
        await ipc.providers.save({ provider, apiKey: apiKey.trim(), baseUrl: '', models: [], enabled: true })
      }

      // Create workspace if path provided
      let wsId = 'default'
      if (wsPath.trim()) {
        const ws = (await ipc.workspaces.create({ name: wsPath.split('/').pop() ?? 'My Workspace', path: wsPath.trim(), type: 'folder' })) as import('../../../shared/types').Workspace
        upsertWorkspace(ws)
        wsId = ws.id
      }

      // Create agent from template
      if (template !== 'skip') {
        const PROMPTS: Record<string, string> = {
          engineer: 'You are an expert software engineer. Read files, write code, run tests, and commit changes.',
          reviewer: 'You are a meticulous code reviewer. Check for bugs, security issues, and suggest improvements.',
        }
        const agentRaw = await ipc.agents.create({
          name:        template === 'engineer' ? 'Engineer' : 'Code Reviewer',
          provider,
          model:       provider === 'anthropic' ? 'claude-sonnet-4-5' : provider === 'openai' ? 'gpt-4o' : 'gemini-1.5-pro',
          workspaceId: wsId,
          prompt:      PROMPTS[template],
          tools:       ['read_file','write_file','list_files','bash','search_code','git_status','git_diff','git_commit'],
          tags:        ['onboarding', template],
        })
        const agent = agentRaw as import('../../../shared/types').Agent
        upsertAgent(agent)
      }

      completeOnboarding()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity:0, scale:0.95 }}
        animate={{ opacity:1, scale:1    }}
        exit={{    opacity:0, scale:0.95 }}
        className="w-full max-w-lg mx-4"
      >
        {/* Progress bar */}
        <div className="h-1 bg-carbon-900 rounded-full mb-6 overflow-hidden">
          <motion.div
            className="h-full bg-void-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="panel overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity:0, x:30 }}
              animate={{ opacity:1, x:0  }}
              exit={{    opacity:0, x:-30}}
              transition={{ duration:0.2 }}
              className="p-8"
            >
              {step === 'welcome' && <WelcomeStep />}
              {step === 'provider' && <ProviderStep provider={provider} setProvider={setProvider} apiKey={apiKey} setApiKey={setApiKey} />}
              {step === 'workspace' && <WorkspaceStep wsPath={wsPath} setWsPath={setWsPath} />}
              {step === 'template' && <TemplateStep template={template} setTemplate={setTemplate} />}
              {step === 'done' && <DoneStep />}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between px-8 py-4 border-t border-carbon-900">
            <button
              onClick={prev}
              disabled={stepIdx === 0}
              className="flex items-center gap-1.5 text-sm text-carbon-500 hover:text-white disabled:opacity-0 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>

            <div className="flex gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === stepIdx ? 'bg-void-500' : i < stepIdx ? 'bg-carbon-600' : 'bg-carbon-800'}`} />
              ))}
            </div>

            {step === 'done' ? (
              <button
                onClick={finish}
                disabled={loading}
                className="flex items-center gap-1.5 text-sm bg-void-500 hover:bg-void-400 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Setting up…' : (<><Check size={14} /> Get Started</>)}
              </button>
            ) : (
              <button
                onClick={next}
                className="flex items-center gap-1.5 text-sm bg-void-500 hover:bg-void-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Continue <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={completeOnboarding}
          className="w-full mt-3 text-xs text-carbon-700 hover:text-carbon-500 transition-colors"
        >
          Skip setup
        </button>
      </motion.div>
    </div>
  )
}

function WelcomeStep() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-void-500/15 border border-void-500/25 mb-5">
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
          <path d="M14 2L24 8V20L14 26L4 20V8L14 2Z" stroke="#6355fa" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M14 8L20 11.5V18.5L14 22L8 18.5V11.5L14 8Z" fill="#6355fa" fillOpacity="0.3" stroke="#6355fa" strokeWidth="1"/>
          <circle cx="14" cy="15" r="2.5" fill="#6355fa"/>
        </svg>
      </div>
      <h1 className="font-display text-2xl font-bold text-white mb-2">Welcome to AgentOS</h1>
      <p className="text-carbon-400 text-sm leading-relaxed max-w-sm mx-auto">
        The enterprise-grade cockpit for orchestrating multiple AI agents across your codebase.
        Let's get you set up in under a minute.
      </p>
      <div className="grid grid-cols-3 gap-3 mt-6">
        {[
          { icon:<Bot size={16}/>,     label:'Multi-agent',  desc:'Run agents in parallel' },
          { icon:<PlugZap size={16}/>, label:'MCP Support',  desc:'Extend with any server' },
          { icon:<FolderGit2 size={16}/>,label:'Git Workspaces',desc:'Isolated environments' },
        ].map(f => (
          <div key={f.label} className="bg-carbon-950 border border-carbon-900 rounded-xl p-3 text-center">
            <div className="text-void-400 flex justify-center mb-1.5">{f.icon}</div>
            <div className="text-xs font-semibold text-carbon-300">{f.label}</div>
            <div className="text-xs text-carbon-600 mt-0.5">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProviderStep({ provider, setProvider, apiKey, setApiKey }: {
  provider: string; setProvider: (p: 'anthropic'|'openai'|'gemini'|'ollama') => void
  apiKey: string; setApiKey: (k: string) => void
}) {
  const PROVIDERS: Array<{id: import('../../../shared/types').AIProvider; label: string; placeholder: string; hint: string}> = [
    { id:'anthropic', label:'Anthropic', placeholder:'sk-ant-…', hint:'Recommended for best results' },
    { id:'openai',    label:'OpenAI',    placeholder:'sk-…',     hint:'GPT-4o and o1 models' },
    { id:'gemini',    label:'Gemini',    placeholder:'AIza…',    hint:'Google AI models' },
    { id:'ollama',    label:'Ollama',    placeholder:'No key needed — runs locally', hint:'Free, privacy-first' },
  ]

  const selected = PROVIDERS.find(p => p.id === provider)!

  return (
    <div>
      <Key size={24} className="text-void-400 mb-4" />
      <h2 className="font-display text-xl font-bold text-white mb-1">Connect an AI Provider</h2>
      <p className="text-carbon-500 text-sm mb-5">Choose your preferred AI provider. You can add more later.</p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {PROVIDERS.map(p => (
          <button key={p.id} onClick={() => setProvider(p.id as 'anthropic'|'openai'|'gemini'|'ollama')}
            className={`p-3 rounded-xl border text-left transition-all ${provider === p.id ? 'border-void-500/50 bg-void-500/10' : 'border-carbon-800 hover:border-carbon-600'}`}>
            <div className="text-sm font-semibold text-carbon-200 mb-0.5">{p.label}</div>
            <div className="text-xs text-carbon-500">{p.hint}</div>
          </button>
        ))}
      </div>

      {provider !== 'ollama' && (
        <div>
          <label className="block text-xs text-carbon-400 mb-1.5 font-medium">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={selected.placeholder}
            className="selectable w-full bg-carbon-950 border border-carbon-800 focus:border-void-500 rounded-xl px-4 py-3 text-sm text-white placeholder-carbon-600 outline-none transition-colors font-mono"
          />
          <p className="text-xs text-carbon-700 mt-1.5">Stored locally on your machine, never sent to our servers.</p>
        </div>
      )}
    </div>
  )
}

function WorkspaceStep({ wsPath, setWsPath }: { wsPath: string; setWsPath: (p: string) => void }) {
  const browse = async () => {
    const result = await ipc.app.showDialog({ properties: ['openDirectory'] }) as { filePaths: string[] }
    if (result?.filePaths?.[0]) setWsPath(result.filePaths[0])
  }

  return (
    <div>
      <FolderGit2 size={24} className="text-signal-yellow mb-4" />
      <h2 className="font-display text-xl font-bold text-white mb-1">Open a Workspace</h2>
      <p className="text-carbon-500 text-sm mb-5">Point AgentOS to your codebase. Agents will read and edit files here.</p>

      <div className="flex gap-2">
        <input
          value={wsPath}
          onChange={e => setWsPath(e.target.value)}
          placeholder="/path/to/your/project"
          className="selectable flex-1 bg-carbon-950 border border-carbon-800 focus:border-void-500 rounded-xl px-4 py-3 text-sm text-white placeholder-carbon-600 outline-none transition-colors font-mono"
        />
        <button onClick={browse}
          className="px-4 py-3 bg-carbon-900 border border-carbon-700 hover:border-carbon-500 rounded-xl text-sm text-carbon-400 hover:text-white transition-colors flex-shrink-0">
          Browse
        </button>
      </div>

      <div className="mt-4 bg-carbon-950 border border-carbon-900 rounded-xl p-4 text-xs text-carbon-500 space-y-1.5">
        <p className="flex items-center gap-2"><Check size={11} className="text-signal-green" /> Agents can read and write files in this directory</p>
        <p className="flex items-center gap-2"><Check size={11} className="text-signal-green" /> Git operations (diff, commit) are supported</p>
        <p className="flex items-center gap-2"><Check size={11} className="text-signal-green" /> Workspace is sandboxed — agents can't escape it</p>
      </div>
    </div>
  )
}

function TemplateStep({ template, setTemplate }: {
  template: 'engineer'|'reviewer'|'skip'; setTemplate: (t: 'engineer'|'reviewer'|'skip') => void
}) {
  const options: { id: typeof template; label: string; desc: string; icon: React.ReactNode }[] = [
    { id:'engineer', label:'Full-Stack Engineer', desc:'Reads/writes code, runs tests, commits changes', icon:<Bot size={20}/> },
    { id:'reviewer', label:'Code Reviewer',       desc:'Reviews PRs, flags bugs and security issues',   icon:<Sparkles size={20}/> },
    { id:'skip',     label:'Skip for now',        desc:'I\'ll configure agents manually',               icon:<ArrowRight size={20}/> },
  ]

  return (
    <div>
      <Sparkles size={24} className="text-plasma-400 mb-4" />
      <h2 className="font-display text-xl font-bold text-white mb-1">Start with a Template</h2>
      <p className="text-carbon-500 text-sm mb-5">We'll create your first agent based on a proven template.</p>

      <div className="space-y-2">
        {options.map(opt => (
          <button key={opt.id} onClick={() => setTemplate(opt.id)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${template === opt.id ? 'border-void-500/50 bg-void-500/10' : 'border-carbon-800 hover:border-carbon-600'}`}>
            <div className={`flex-shrink-0 ${template === opt.id ? 'text-void-400' : 'text-carbon-600'}`}>{opt.icon}</div>
            <div>
              <div className="text-sm font-semibold text-carbon-200">{opt.label}</div>
              <div className="text-xs text-carbon-500 mt-0.5">{opt.desc}</div>
            </div>
            {template === opt.id && <Check size={14} className="text-void-400 ml-auto flex-shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function DoneStep() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-signal-green/15 border border-signal-green/25 mb-5">
        <Check size={28} className="text-signal-green" />
      </div>
      <h2 className="font-display text-2xl font-bold text-white mb-2">You're all set!</h2>
      <p className="text-carbon-400 text-sm leading-relaxed max-w-sm mx-auto mb-5">
        AgentOS is ready. Click "Get Started" to launch your agent cockpit.
      </p>
      <div className="text-xs text-carbon-600 space-y-1">
        <p>Press <kbd className="bg-carbon-900 border border-carbon-800 px-1.5 rounded">⌘K</kbd> for the command palette</p>
        <p>Press <kbd className="bg-carbon-900 border border-carbon-800 px-1.5 rounded">⌘P</kbd> to search everything</p>
        <p>Press <kbd className="bg-carbon-900 border border-carbon-800 px-1.5 rounded">?</kbd> for keyboard shortcuts</p>
      </div>
    </div>
  )
}
