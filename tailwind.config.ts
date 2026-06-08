import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark sidebar surface
        sidebar: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          active: '#1d3a5f',
          border: '#1e293b',
        },
        // Light content surface
        surface: {
          DEFAULT: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
        },
        // Accent — brand blue-teal
        accent: {
          DEFAULT: '#1a7fc4',
          hover: '#1265a0',
          subtle: '#ddeeff',
          muted: '#82bfe8',
        },
        // Text
        text: {
          primary: '#0f172a',
          secondary: '#475569',
          muted: '#94a3b8',
          inverse: '#f8fafc',
          'inverse-muted': '#94a3b8',
        },
        // Status
        status: {
          error: '#ef4444',
          warning: '#f59e0b',
          success: '#10b981',
          info: '#3b82f6',
          'error-bg': '#fef2f2',
          'warning-bg': '#fffbeb',
          'success-bg': '#f0fdf4',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        card: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        elevated:
          '0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
