/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme palette - Artifact Terminal
        background: '#0a0a0b',
        surface: '#111113',
        surfaceHighlight: '#1a1a1d',
        border: '#2a2a2d',

        // Warm amber accent
        amber: {
          glow: '#FFA726',
          DEFAULT: '#FF9800',
          dim: 'rgba(255, 167, 38, 0.15)',
        },

        // Semantic colors (dark mode optimized)
        success: '#4ade80',
        error: '#f87171',
        warning: '#fbbf24',
        info: '#60a5fa',

        // Text
        text: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          tertiary: '#71717a',
          muted: '#52525b',
        },

        // Subtle grid lines
        grid: '#1f1f23',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['"Geist"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': `linear-gradient(to right, #1f1f23 1px, transparent 1px),
                         linear-gradient(to bottom, #1f1f23 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'stagger-1': 'stagger1 0.4s ease-out',
        'stagger-2': 'stagger2 0.4s ease-out 0.1s',
        'stagger-3': 'stagger3 0.4s ease-out 0.2s',
        'stagger-4': 'stagger4 0.4s ease-out 0.3s',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        stagger1: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        stagger2: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        stagger3: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        stagger4: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        cursorBlink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(255, 167, 38, 0.3)',
        'glow-sm': '0 0 10px rgba(255, 167, 38, 0.2)',
        'surface': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'surface-lg': '0 8px 40px rgba(0, 0, 0, 0.5)',
      },
      borderWidth: {
        'hairline': '0.5px',
      },
    },
  },
  plugins: [],
}
