import type { Config } from 'tailwindcss';

/**
 * Dashboard palette aligned to the product mock:
 * deep navy canvas, blue active accents, green health, amber warnings.
 * Typeface: Cause (Google Fonts variable).
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#0b1019',
          elevated: '#101725',
          glow: '#121a2a',
        },
        glass: {
          DEFAULT: '#121a28',
          strong: '#162033',
          border: 'rgba(120, 150, 200, 0.14)',
          highlight: 'rgba(120, 170, 255, 0.18)',
        },
        sidebar: {
          DEFAULT: '#0a0f18',
          hover: '#141d2c',
          active: '#162033',
          border: 'rgba(120, 150, 200, 0.12)',
        },
        surface: {
          DEFAULT: '#101725',
          card: '#141d2c',
          elevated: '#162033',
          border: 'rgba(120, 150, 200, 0.14)',
          muted: 'rgba(120, 160, 220, 0.06)',
        },
        hairline: {
          DEFAULT: 'rgba(120, 150, 200, 0.14)',
          soft: 'rgba(120, 160, 220, 0.08)',
          strong: 'rgba(140, 180, 255, 0.22)',
        },
        accent: {
          DEFAULT: '#4f8cff',
          hover: '#6ba0ff',
          subtle: 'rgba(79, 140, 255, 0.14)',
          muted: '#8fb4ff',
          glow: 'rgba(79, 140, 255, 0.35)',
        },
        text: {
          primary: '#eef2f8',
          secondary: '#b4c0d4',
          muted: '#7f8fa8',
          inverse: '#0b1019',
          'inverse-muted': '#4a5568',
          ash: '#5c6b82',
          stone: '#445066',
        },
        status: {
          error: '#ff6b6b',
          warning: '#f5b942',
          success: '#3dd68c',
          info: '#4f8cff',
          'error-bg': 'rgba(255, 107, 107, 0.14)',
          'warning-bg': 'rgba(245, 185, 66, 0.14)',
          'success-bg': 'rgba(61, 214, 140, 0.14)',
          'info-bg': 'rgba(79, 140, 255, 0.14)',
        },
      },
      fontFamily: {
        sans: [
          '"Cause"',
          'system-ui',
          'ui-sans-serif',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'Cascadia Code',
          'ui-monospace',
          'SFMono-Regular',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
        body: ['0.875rem', { lineHeight: '1.25rem' }],
        subtitle: ['1.25rem', { lineHeight: '1.75rem' }],
        title: ['1.75rem', { lineHeight: '2.25rem' }],
      },
      borderRadius: {
        card: '0.75rem',
        control: '0.5rem',
        overlay: '0.75rem',
        pill: '9999px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.35)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.45)',
        glow: '0 0 24px rgba(79, 140, 255, 0.2)',
        'glow-sm': '0 0 12px rgba(79, 140, 255, 0.15)',
        palette:
          '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(120,150,200,0.1)',
        card: '0 4px 24px rgba(0, 0, 0, 0.28)',
        elevated: '0 8px 28px rgba(0, 0, 0, 0.35)',
      },
      maxWidth: {
        content: '74rem',
      },
      spacing: {
        /* Outer page gutter — close to sidebar wall, not a floating island */
        page: '1rem',
        'page-lg': '1.25rem',
        /* Inner card padding — text should not hug panel edges */
        'panel-x': '1.25rem',
        'panel-y': '1rem',
        'sidebar-expanded': '220px',
        'sidebar-collapsed': '72px',
      },
      transitionTimingFunction: {
        ray: 'cubic-bezier(0.2, 0, 0, 1)',
        'out-expo': 'cubic-bezier(0.2, 0, 0, 1)',
        spring: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'blur-fade-in': {
          '0%': {
            opacity: '0',
            filter: 'blur(6px)',
            transform: 'translateY(6px)',
          },
          '100%': {
            opacity: '1',
            filter: 'blur(0)',
            transform: 'translateY(0)',
          },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.28s cubic-bezier(0.2, 0, 0, 1) both',
        'fade-in': 'fade-in 0.2s cubic-bezier(0.2, 0, 0, 1) both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.2, 0, 0, 1) both',
        'blur-fade-in': 'blur-fade-in 0.35s cubic-bezier(0.2, 0, 0, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
