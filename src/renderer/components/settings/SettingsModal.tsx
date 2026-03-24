import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store'
import { ipc } from '../../hooks/useIPC'
import { X, Key, Palette, Shield, Activity, Server, Keyboard } from 'lucide-react'
import type { ProviderConfig, AIProvider, AuditEvent } from '../../../shared/types'
import { ShortcutsHelp } from '../../hooks/useKeyboardShortcuts'

type Tab = 'providers'|'appearance'|'auth'|'audit'|'shortcuts'|'advanced'
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id:'providers',  label:'AI Providers', icon:<Key size={12}/> },
  { id:'appearance', label:'Appearance',   icon:<Palette size={12}/> },
  { id:'auth',       label:'Auth & SSO',   icon:<Shield size={12}/> },
  { id:'audit',      label:'Audit Logs',   icon:<Activity size={12}/> },
  { id:'shortcuts',  label:'Shortcuts',    icon:<Keyboard size={12}/> },
  { id:'advanced',   label:'Advanced',     icon:<Server size={12}/> },
]

export function SettingsModal() {
  const { toggleSettings, user } = useStore()
  const [tab, setTab] = useState<Tab>('providers')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={toggleSettings}>
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
        className="panel w-full max-w-3xl mx-4 flex overflow-hidden" style={{height:560}}
        onClick={e => e.stopPropagation()}>
        <div className="w-44 bg-carbon-950 border-r border-carbon-900 flex flex-col flex-shrink-0">
          <div className="panel-header py-3 font-bold text-white text-xs">⚙ Settings</div>
          <nav className="flex-1 py-2 overflow-y-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                className={`w-full flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors ${tab===t.id?'bg-carbon-925 text-white border-r-2 border-void-500':'text-carbon-500 hover:text-carbon-300 hover:bg-carbon-925/50'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
          {user && (
            <div className="p-3 border-t border-carbon-900">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-void-500/30 flex items-center justify-center text-xs text-void-300 font-bold flex-shrink-0">{user.name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="text-xs text-carbon-300 truncate font-medium">{user.name}</div>
                  <div className="text-xs text-carbon-600 truncate">{user.email}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-carbon-900 flex-shrink-0">
            <h2 className="font-display text-sm font-bold text-white">{TABS.find(t=>t.id===tab)?.label}</h2>
            <button onClick={toggleSettings} className="text-carbon-500 hover:text-white transition-colors w-7 h-7 flex items-center justify-center rounded hover:bg-carbon-800"><X size={14}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {tab==='providers'  && <ProvidersTab/>}
            {tab==='appearance' && <AppearanceTab/>}
            {tab==='auth'       && <AuthTab/>}
            {tab==='audit'      && <AuditTab/>}
            {tab==='shortcuts'  && <ShortcutsHelp/>}
            {tab==='advanced'   && <AdvancedTab/>}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Providers ─────────────────────────────────────────────────────────────────
const PROVIDER_INFO: { id: AIProvider; label: string; placeholder: string; hasUrl: boolean }[] = [
  { id:'anthropic', label:'Anthropic (Claude)',   placeholder:'sk-ant-api03-…',   hasUrl:false },
  { id:'openai',    label:'OpenAI',               placeholder:'sk-proj-…',        hasUrl:false },
  { id:'gemini',    label:'Google Gemini',         placeholder:'AIzaSy…',          hasUrl:false },
  { id:'ollama',    label:'Ollama (Local)',         placeholder:'(no key needed)',  hasUrl:true  },
  { id:'custom',    label:'Custom (OpenAI-compat)',placeholder:'your-api-key',     hasUrl:true  },
]

function ProvidersTab() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [saving, setSaving]   = useState<string|null>(null)
  const [tested, setTested]   = useState<Record<string,boolean>>({})

  useEffect(() => {
    ipc.providers.list().then(d => setConfigs(d as ProviderConfig[])).catch(console.error)
  }, [])

  const save = async (config: ProviderConfig) => {
    setSaving(config.provider)
    try {
      await ipc.providers.save(config)
      setConfigs(prev => {
        const i = prev.findIndex(c => c.provider === config.provider)
        if (i >= 0) { const n = [...prev]; n[i] = config; return n }
        return [...prev, config]
      })
    } finally { setSaving(null) }
  }

  return (
    <div className="space-y-4">
      {PROVIDER_INFO.map(p => {
        const cfg = configs.find(c => c.provider === p.id)
        return (
          <ProviderCard key={p.id} info={p} config={cfg}
            saving={saving === p.id}
            onSave={save} />
        )
      })}
    </div>
  )
}

function ProviderCard({ info, config, saving, onSave }: {
  info: typeof PROVIDER_INFO[0]
  config?: ProviderConfig
  saving: boolean
  onSave: (c: ProviderConfig) => void
}) {
  const [key,     setKey]     = useState(config?.apiKey   ?? '')
  const [url,     setUrl]     = useState(config?.baseUrl  ?? (info.id === 'ollama' ? 'http://localhost:11434' : ''))
  const [enabled, setEnabled] = useState(config?.enabled  ?? false)

  return (
    <div className={`border rounded-xl p-4 transition-colors ${enabled ? 'border-void-500/30 bg-void-500/5' : 'border-carbon-800 bg-carbon-950'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">{info.label}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-carbon-500">{enabled ? 'Enabled' : 'Disabled'}</span>
          <div onClick={() => setEnabled(v => !v)}
            className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${enabled ? 'bg-void-500' : 'bg-carbon-700'}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}/>
          </div>
        </label>
      </div>
      <div className="space-y-2">
        {!info.hasUrl && (
          <div>
            <label className="text-xs text-carbon-500 block mb-1">API Key</label>
            <input type="password" value={key} onChange={e => setKey(e.target.value)}
              placeholder={info.placeholder}
              className="selectable w-full bg-carbon-975 border border-carbon-800 focus:border-void-500 rounded-lg px-3 py-2 text-xs font-mono text-carbon-200 placeholder-carbon-700 outline-none transition-colors"/>
          </div>
        )}
        {info.hasUrl && (
          <div>
            <label className="text-xs text-carbon-500 block mb-1">Base URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder={info.id === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
              className="selectable w-full bg-carbon-975 border border-carbon-800 focus:border-void-500 rounded-lg px-3 py-2 text-xs font-mono text-carbon-200 placeholder-carbon-700 outline-none transition-colors"/>
          </div>
        )}
      </div>
      <button onClick={() => onSave({ provider:info.id, apiKey:key||undefined, baseUrl:url||undefined, models:[], enabled })}
        disabled={saving}
        className="mt-3 w-full py-1.5 bg-void-500/20 hover:bg-void-500/30 border border-void-500/30 text-void-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ── Appearance ────────────────────────────────────────────────────────────────
function AppearanceTab() {
  const { settings, setSettings } = useStore()
  const [fontSize,   setFontSize]   = useState(settings?.appearance?.fontSize   ?? 14)
  const [density,    setDensity]    = useState(settings?.appearance?.density    ?? 'normal')
  const [animations, setAnimations] = useState(settings?.appearance?.animations ?? true)
  const [saved,      setSaved]      = useState(false)

  const save = async () => {
    const updated = {
      ...settings,
      appearance: { ...(settings?.appearance ?? {}), fontSize, density, animations,
        theme: settings?.appearance?.theme ?? 'dark',
        accentColor: settings?.appearance?.accentColor ?? '#6355fa',
        fontFamily: settings?.appearance?.fontFamily ?? 'JetBrains Mono',
        defaultLayout: settings?.appearance?.defaultLayout ?? 'single',
      },
    }
    await ipc.settings.set(updated)
    setSettings(updated as import('../../../shared/types').AppSettings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <SettingRow label="Font Size" description="Editor, terminal, and chat font size">
        <div className="flex items-center gap-2">
          <input type="range" min={11} max={20} value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            className="w-24 accent-void-500"/>
          <span className="text-xs text-carbon-300 w-8">{fontSize}px</span>
        </div>
      </SettingRow>

      <SettingRow label="UI Density" description="Spacing between elements">
        <div className="flex gap-1">
          {(['compact','normal','spacious'] as const).map(d => (
            <button key={d} onClick={() => setDensity(d)}
              className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${density===d ? 'bg-void-500/20 border border-void-500/40 text-void-300' : 'border border-carbon-800 text-carbon-500 hover:border-carbon-600'}`}>
              {d}
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Animations" description="Enable UI transition animations">
        <Toggle value={animations} onChange={setAnimations}/>
      </SettingRow>

      <div className="pt-2">
        <button onClick={save}
          className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${saved ? 'bg-signal-green/20 border border-signal-green/30 text-signal-green' : 'bg-void-500 hover:bg-void-400 text-white'}`}>
          {saved ? '✓ Saved' : 'Save Appearance'}
        </button>
      </div>
    </div>
  )
}

// ── Auth & SSO ────────────────────────────────────────────────────────────────
function AuthTab() {
  const { user, settings } = useStore()
  const [samlEntry,    setSamlEntry]    = useState(settings?.auth?.saml?.entryPoint    ?? '')
  const [samlIssuer,   setSamlIssuer]   = useState(settings?.auth?.saml?.issuer        ?? '')
  const [samlCert,     setSamlCert]     = useState(settings?.auth?.saml?.cert          ?? '')
  const [samlCallback, setSamlCallback] = useState(settings?.auth?.saml?.callbackUrl   ?? '')
  const [saved, setSaved] = useState(false)

  const saveSAML = async () => {
    const updated = {
      ...settings,
      auth: {
        ...(settings?.auth ?? {}),
        provider: 'saml' as const,
        saml: { entryPoint:samlEntry, issuer:samlIssuer, cert:samlCert, callbackUrl:samlCallback },
        jwtSecret: settings?.auth?.jwtSecret ?? '',
        sessionTTL: settings?.auth?.sessionTTL ?? 2592000,
      },
    }
    await ipc.settings.set(updated)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Current user info */}
      {user && (
        <div className="bg-carbon-950 border border-carbon-800 rounded-xl p-4">
          <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-3">Current User</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-void-500/30 flex items-center justify-center text-sm text-void-200 font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm text-white font-medium">{user.name}</div>
              <div className="text-xs text-carbon-500">{user.email}</div>
              <div className="text-xs text-carbon-600 mt-0.5">Role: {user.role} · Provider: {user.authProvider}</div>
            </div>
          </div>
        </div>
      )}

      {/* SAML SSO */}
      <div className="bg-carbon-950 border border-carbon-800 rounded-xl p-4">
        <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-3">SAML 2.0 SSO</p>
        <div className="space-y-2.5">
          {[
            { label:'Entry Point URL',  value:samlEntry,    set:setSamlEntry,    ph:'https://idp.example.com/sso/saml' },
            { label:'Issuer',           value:samlIssuer,   set:setSamlIssuer,   ph:'https://app.agentos.io' },
            { label:'Callback URL',     value:samlCallback, set:setSamlCallback, ph:'https://app.agentos.io/auth/saml/callback' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-carbon-500 block mb-1">{f.label}</label>
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                className="selectable w-full bg-carbon-975 border border-carbon-800 focus:border-void-500 rounded px-3 py-2 text-xs text-carbon-200 placeholder-carbon-700 outline-none"/>
            </div>
          ))}
          <div>
            <label className="text-xs text-carbon-500 block mb-1">X.509 Certificate</label>
            <textarea value={samlCert} onChange={e => setSamlCert(e.target.value)} rows={3}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              className="selectable w-full bg-carbon-975 border border-carbon-800 focus:border-void-500 rounded px-3 py-2 text-xs font-mono text-carbon-200 placeholder-carbon-700 outline-none resize-none"/>
          </div>
          <button onClick={saveSAML}
            className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${saved ? 'bg-signal-green/20 border border-signal-green/30 text-signal-green' : 'bg-void-500/20 border border-void-500/30 text-void-300 hover:bg-void-500/30'}`}>
            {saved ? '✓ Saved' : 'Save SAML Config'}
          </button>
        </div>
      </div>

      {/* OAuth2 note */}
      <div className="bg-carbon-950 border border-carbon-800 rounded-xl p-4">
        <p className="text-xs text-carbon-500 font-semibold uppercase tracking-wide mb-2">OAuth2 / OpenID Connect</p>
        <p className="text-xs text-carbon-600 leading-relaxed">
          OAuth2 providers (GitHub, Google, Azure AD) can be configured via environment variables
          when running in self-hosted mode. Set <code className="bg-carbon-900 px-1 rounded">OAUTH2_CLIENT_ID</code>,
          <code className="bg-carbon-900 px-1 rounded ml-1">OAUTH2_CLIENT_SECRET</code>, and
          <code className="bg-carbon-900 px-1 rounded ml-1">OAUTH2_PROVIDER</code> in your <code className="bg-carbon-900 px-1 rounded">.env</code> file.
        </p>
      </div>
    </div>
  )
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function AuditTab() {
  const [events,  setEvents]  = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('')

  useEffect(() => {
    ipc.audit.list({}).then(d => setEvents(d as AuditEvent[])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const filtered = filter ? events.filter(e => e.action.includes(filter) || e.resource.includes(filter)) : events

  const exportAudit = () => {
    const data = JSON.stringify(filtered, null, 2)
    const blob = new Blob([data], { type:'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `audit-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex gap-2 flex-shrink-0">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by action or resource…"
          className="selectable flex-1 bg-carbon-950 border border-carbon-800 rounded-lg px-3 py-1.5 text-xs text-carbon-200 placeholder-carbon-600 outline-none focus:border-void-500"/>
        <button onClick={exportAudit} className="px-3 py-1.5 bg-carbon-900 border border-carbon-700 rounded-lg text-xs text-carbon-400 hover:text-white transition-colors flex-shrink-0">
          Export
        </button>
      </div>
      {loading ? (
        <div className="text-center py-8 text-carbon-600 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-carbon-600 text-sm">No audit events {filter ? 'matching filter' : 'yet'}</div>
      ) : (
        <div className="space-y-1 overflow-y-auto flex-1">
          {filtered.map(e => (
            <div key={e.id} className="bg-carbon-950 border border-carbon-900 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
                e.severity === 'critical' ? 'bg-signal-red/20 text-signal-red' :
                e.severity === 'high'     ? 'bg-signal-orange/20 text-signal-orange/80' :
                e.severity === 'medium'   ? 'bg-signal-yellow/20 text-signal-yellow' :
                'bg-carbon-800 text-carbon-400'}`}>{e.severity}</span>
              <span className="text-xs text-carbon-300 flex-1 truncate">{e.action} · {e.resource}</span>
              <span className="text-xs text-carbon-600 font-mono flex-shrink-0">{new Date(e.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Advanced ──────────────────────────────────────────────────────────────────
function AdvancedTab() {
  const { settings } = useStore()
  const [selfHosted, setSelfHosted] = useState(settings?.collab?.enabled === false)
  const [maxAgents,  setMaxAgents]  = useState(settings?.workspace?.maxAgents ?? 10)
  const [channel,    setChannel]    = useState<'stable'|'beta'|'nightly'>(settings?.updateChannel ?? 'stable')
  const [saved,      setSaved]      = useState(false)

  const save = async () => {
    await ipc.settings.set({
      workspace:     { ...(settings?.workspace ?? {}), maxAgents, queueSize: settings?.workspace?.queueSize ?? 20, defaultPath: settings?.workspace?.defaultPath ?? '', gitAutoCommit: false, dockerEnabled: false },
      updateChannel: channel as 'stable'|'beta'|'nightly',
    })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <SettingRow label="Max Concurrent Agents" description="Maximum agents that can run simultaneously">
        <div className="flex items-center gap-2">
          <input type="range" min={1} max={20} value={maxAgents} onChange={e => setMaxAgents(Number(e.target.value))} className="w-20 accent-void-500"/>
          <span className="text-xs text-carbon-300 w-6">{maxAgents}</span>
        </div>
      </SettingRow>

      <SettingRow label="Update Channel" description="Which release channel to use">
        <select value={channel} onChange={e => setChannel(e.target.value as 'stable'|'beta'|'nightly')}
          className="bg-carbon-950 border border-carbon-800 rounded-lg px-2.5 py-1 text-xs text-carbon-300 outline-none focus:border-void-500">
          <option value="stable">Stable</option>
          <option value="beta">Beta</option>
          <option value="nightly">Nightly</option>
        </select>
      </SettingRow>

      <div className="pt-2">
        <button onClick={save}
          className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${saved ? 'bg-signal-green/20 border border-signal-green/30 text-signal-green' : 'bg-void-500 hover:bg-void-400 text-white'}`}>
          {saved ? '✓ Saved' : 'Save Advanced Settings'}
        </button>
      </div>

      <div className="pt-2 border-t border-carbon-900 space-y-2">
        <button onClick={() => ipc.settings.export().then(d => {
          const blob = new Blob([d as string], { type:'application/json' })
          const url  = URL.createObjectURL(blob)
          const a    = document.createElement('a'); a.href=url; a.download='agentos-settings.json'; a.click()
          URL.revokeObjectURL(url)
        })} className="w-full py-2 border border-carbon-700 text-carbon-400 hover:text-white rounded-lg text-xs transition-colors">
          Export Settings
        </button>
        <button onClick={() => {
          if (confirm('Reset ALL settings to defaults? This cannot be undone.')) {
            ipc.settings.reset().then(() => window.location.reload())
          }
        }} className="w-full py-2 bg-signal-red/10 border border-signal-red/30 text-signal-red hover:bg-signal-red/20 rounded-lg text-xs transition-colors">
          Reset All Settings
        </button>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SettingRow({ label, description, children }: { label:string; description:string; children:React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-carbon-900">
      <div>
        <div className="text-sm text-carbon-200 font-medium">{label}</div>
        <div className="text-xs text-carbon-600 mt-0.5">{description}</div>
      </div>
      <div className="ml-4 flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value:boolean; onChange:(v:boolean)=>void }) {
  return (
    <div onClick={() => onChange(!value)}
      className={`w-8 h-4 rounded-full cursor-pointer transition-colors relative ${value ? 'bg-void-500' : 'bg-carbon-700'}`}>
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`}/>
    </div>
  )
}
