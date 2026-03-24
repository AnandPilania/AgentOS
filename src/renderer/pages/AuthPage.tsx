import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ipc } from '../hooks/useIPC'
import { useStore } from '../store'
import AnimatedLogo from '../components/Logo';

type Mode = 'login' | 'register'

export function AuthPage() {
  const [mode, setMode]       = useState<Mode>('login')
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [password, setPass]   = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser, setToken } = useStore()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const result = (mode === 'login'
        ? await ipc.auth.login({ email, password })
        : await ipc.auth.register({ email, name, password })) as { token: string; user: import('../../shared/types').User }
      setToken(result.token)
      setUser(result.user)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen w-screen p-8 bg-carbon-975 flex items-center justify-center overflow-hidden relative">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid-void bg-grid opacity-50 pointer-events-none" />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-void-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-plasma-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md overflow-y-auto"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-void-500/20 border border-void-500/30 mb-4">
            <AnimatedLogo size={28} />
          </div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">AgentOS</h1>
          <p className="text-carbon-400 text-sm mt-1">AI Agent Orchestration Cockpit</p>
        </div>

        {/* Card */}
        <div className="panel p-6">
          {/* Tab switcher */}
          <div className="flex mb-6 bg-carbon-950 rounded-lg p-1">
            {(['login', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all no-drag ${
                  mode === m
                    ? 'bg-carbon-800 text-white shadow-sm'
                    : 'text-carbon-400 hover:text-carbon-200'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <InputField label="Full Name" type="text" value={name}
                    onChange={setName} placeholder="Jane Smith" required />
                </motion.div>
              )}
            </AnimatePresence>

            <InputField label="Email" type="email" value={email}
              onChange={setEmail} placeholder="you@company.com" required />
            <InputField label="Password" type="password" value={password}
              onChange={setPass} placeholder="••••••••" required />

            {error && (
              <div className="bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2 text-signal-red text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-void-500 hover:bg-void-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium text-sm transition-colors no-drag"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-carbon-800" />
            <span className="text-carbon-500 text-xs">OR CONTINUE WITH</span>
            <div className="flex-1 h-px bg-carbon-800" />
          </div>

          {/* SSO Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'GitHub', color: '#ffffff' },
              { label: 'Google', color: '#ea4335' },
              { label: 'SAML',   color: '#6355fa' },
            ].map(({ label, color }) => (
              <button
                key={label}
                onClick={() => ipc.auth.ssoInit?.(label.toLowerCase())}
                className="py-2 rounded-lg border border-carbon-700 hover:border-carbon-500 text-xs text-carbon-300 hover:text-white transition-all no-drag"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-carbon-600 text-xs mt-6">
          Enterprise SSO · Self-hosted · Air-gapped support
        </p>
      </motion.div>
    </div>
  )
}

function InputField({ label, type, value, onChange, placeholder, required }: {
  label: string; type: string; value: string
  onChange: (v: string) => void; placeholder: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs text-carbon-400 mb-1.5 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="selectable w-full bg-carbon-950 border border-carbon-700 hover:border-carbon-500 focus:border-void-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-carbon-600 outline-none transition-colors"
      />
    </div>
  )
}
