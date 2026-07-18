import type { Config } from 'tailwindcss';

/**
 * Fluent Ops Shell × Raycast Command Layer
 * Solid surface ladder, hairline borders, monochrome chrome,
 * semantic accents only. Acrylic reserved for transient overlays.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#07080a',
          elevated: '#0d0d0d',
          glow: '#101111',
        },
        glass: {
          DEFAULT: '#0d0d0d',
          strong: '#101111',
          border: '#242728',
          highlight: 'rgba(255,255,255,0.16)',
        },
        sidebar: {
          DEFAULT: '#07080a',
          hover: '#121212',
          active: '#121212',
          border: '#242728',
        },
        surface: {
          DEFAULT: '#0d0d0d',
          card: '#121212',
          elevated: '#101111',
          border: '#242728',
          muted: 'rgba(255,255,255,0.04)',
        },
        hairline: {
          DEFAULT: '#242728',
          soft: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.16)',
        },
        accent: {
          DEFAULT: '#f4f4f6',
          hover: '#ffffff',
          subtle: 'rgba(255,255,255,0.08)',
          muted: '#cdcdcd',
          glow: 'transparent',
        },
        text: {
          primary: '#f4f4f6',
          secondary: '#cdcdcd',
          muted: '#9c9c9d',
          inverse: '#07080a',
          'inverse-muted': '#434345',
          ash: '#6a6b6c',
          stone: '#434345',
        },
        status: {
          error: '#ff6161',
          warning: '#ffc533',
          success: '#59d499',
          info: '#57c1ff',
          'error-bg': 'rgba(255,97,97,0.15)',
          'warning-bg': 'rgba(255,197,51,0.15)',
          'success-bg': 'rgba(89,212,153,0.15)',
          'info-bg': 'rgba(87,193,255,0.15)',
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'system-ui',
          'ui-sans-serif',
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
        card: '0.5rem',
        control: '0.375rem',
        overlay: '0.625rem',
        pill: '9999px',
      },
      boxShadow: {
        glass: 'none',
        'glass-lg': 'none',
        glow: 'none',
        'glow-sm': 'none',
        palette:
          '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
        card: 'none',
        elevated: 'none',
      },
      maxWidth: {
        content: '74rem',
      },
      spacing: {
        page: '1.5rem',
        'page-lg': '2rem',
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
