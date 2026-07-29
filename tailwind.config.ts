import type { Config } from 'tailwindcss';

/**
 * Semantic palette via CSS variables (see global.css).
 * Light is default; set `data-theme="dark"` on <html> for dark shell.
 * Typeface: Cause (Google Fonts variable).
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: 'rgb(var(--dl-canvas) / <alpha-value>)',
          elevated: 'rgb(var(--dl-canvas-elevated) / <alpha-value>)',
          glow: 'rgb(var(--dl-canvas-glow) / <alpha-value>)',
        },
        glass: {
          DEFAULT: 'rgb(var(--dl-glass) / <alpha-value>)',
          strong: 'rgb(var(--dl-glass-strong) / <alpha-value>)',
          border: 'rgb(var(--dl-glass-border) / <alpha-value>)',
          highlight: 'rgb(var(--dl-glass-highlight) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(var(--dl-sidebar) / <alpha-value>)',
          hover: 'rgb(var(--dl-sidebar-hover) / <alpha-value>)',
          active: 'rgb(var(--dl-sidebar-active) / <alpha-value>)',
          border: 'rgb(var(--dl-sidebar-border) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--dl-surface) / <alpha-value>)',
          card: 'rgb(var(--dl-surface-card) / <alpha-value>)',
          elevated: 'rgb(var(--dl-surface-elevated) / <alpha-value>)',
          border: 'rgb(var(--dl-surface-border) / <alpha-value>)',
          muted: 'rgb(var(--dl-surface-muted) / <alpha-value>)',
        },
        hairline: {
          DEFAULT: 'rgb(var(--dl-hairline) / <alpha-value>)',
          soft: 'rgb(var(--dl-hairline-soft) / <alpha-value>)',
          strong: 'rgb(var(--dl-hairline-strong) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--dl-accent) / <alpha-value>)',
          hover: 'rgb(var(--dl-accent-hover) / <alpha-value>)',
          subtle: 'rgb(var(--dl-accent-subtle) / <alpha-value>)',
          muted: 'rgb(var(--dl-accent-muted) / <alpha-value>)',
          glow: 'rgb(var(--dl-accent-glow) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--dl-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--dl-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--dl-text-muted) / <alpha-value>)',
          inverse: 'rgb(var(--dl-text-inverse) / <alpha-value>)',
          'inverse-muted': 'rgb(var(--dl-text-inverse-muted) / <alpha-value>)',
          ash: 'rgb(var(--dl-text-ash) / <alpha-value>)',
          stone: 'rgb(var(--dl-text-stone) / <alpha-value>)',
        },
        status: {
          error: 'rgb(var(--dl-status-error) / <alpha-value>)',
          warning: 'rgb(var(--dl-status-warning) / <alpha-value>)',
          success: 'rgb(var(--dl-status-success) / <alpha-value>)',
          info: 'rgb(var(--dl-status-info) / <alpha-value>)',
          'error-bg': 'rgb(var(--dl-status-error-bg) / <alpha-value>)',
          'warning-bg': 'rgb(var(--dl-status-warning-bg) / <alpha-value>)',
          'success-bg': 'rgb(var(--dl-status-success-bg) / <alpha-value>)',
          'info-bg': 'rgb(var(--dl-status-info-bg) / <alpha-value>)',
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
        glass: 'var(--dl-shadow-glass)',
        'glass-lg': 'var(--dl-shadow-glass-lg)',
        glow: 'var(--dl-shadow-glow)',
        'glow-sm': 'var(--dl-shadow-glow-sm)',
        palette: 'var(--dl-shadow-palette)',
        card: 'var(--dl-shadow-card)',
        elevated: 'var(--dl-shadow-elevated)',
      },
      maxWidth: {
        content: '74rem',
      },
      spacing: {
        page: '1rem',
        'page-lg': '1.25rem',
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
