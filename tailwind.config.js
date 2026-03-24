/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // AgentOS Design System
        void: {
          50:  '#f0f0ff',
          100: '#e2e3ff',
          200: '#c8caff',
          300: '#a5a8ff',
          400: '#817bff',
          500: '#6355fa',
          600: '#5537ef',
          700: '#4928d4',
          800: '#3d23ac',
          900: '#342188',
          950: '#1e1254',
        },
        plasma: {
          50:  '#fff0fb',
          100: '#ffe3f8',
          200: '#ffc6f2',
          300: '#ff98e7',
          400: '#ff59d6',
          500: '#ff26c5',
          600: '#f000a3',
          700: '#d10085',
          800: '#ad006e',
          900: '#8f035b',
          950: '#580037',
        },
        carbon: {
          50:  '#f6f6f7',
          100: '#e2e3e6',
          200: '#c5c7cc',
          300: '#a1a5ae',
          400: '#7d828e',
          500: '#636874',
          600: '#4f535d',
          700: '#41444d',
          800: '#383a42',
          900: '#22242a',
          925: '#1a1c21',
          950: '#111317',
          975: '#0a0b0d',
        },
        signal: {
          green:  '#00ff88',
          yellow: '#ffdd00',
          red:    '#ff3355',
          blue:   '#00aaff',
          orange: '#ff7700',
        }
      },
      fontFamily: {
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':     'spin 3s linear infinite',
        'slide-in':      'slideIn 0.2s ease-out',
        'slide-up':      'slideUp 0.3s ease-out',
        'fade-in':       'fadeIn 0.2s ease-out',
        'glow':          'glow 2s ease-in-out infinite alternate',
        'scan':          'scan 2s linear infinite',
        'flicker':       'flicker 0.15s infinite',
        'agent-active':  'agentActive 1.5s ease-in-out infinite',
      },
      keyframes: {
        slideIn:    { from: { transform: 'translateX(-100%)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        slideUp:    { from: { transform: 'translateY(10px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        glow:       { from: { boxShadow: '0 0 5px #6355fa' }, to: { boxShadow: '0 0 20px #6355fa, 0 0 40px #6355fa40' } },
        scan:       { '0%': { top: '0%' }, '100%': { top: '100%' } },
        flicker:    { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.8' } },
        agentActive: { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.7', transform: 'scale(0.97)' } },
      },
      backgroundImage: {
        'grid-void':     'linear-gradient(rgba(99,85,250,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,85,250,0.05) 1px, transparent 1px)',
        'scanline':      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)',
        'agent-glow':    'radial-gradient(ellipse at center, rgba(99,85,250,0.15) 0%, transparent 70%)',
        'terminal-bg':   'linear-gradient(180deg, #0a0b0d 0%, #111317 100%)',
      },
      backgroundSize: {
        'grid': '32px 32px',
      },
      boxShadow: {
        'void':    '0 0 0 1px rgba(99,85,250,0.3), 0 0 20px rgba(99,85,250,0.1)',
        'plasma':  '0 0 0 1px rgba(255,38,197,0.3), 0 0 20px rgba(255,38,197,0.1)',
        'panel':   '0 4px 24px rgba(0,0,0,0.4)',
        'agent':   '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        'terminal':'inset 0 2px 8px rgba(0,0,0,0.5)',
      },
      borderRadius: {
        'panel': '12px',
      }
    }
  },
  plugins: []
}
