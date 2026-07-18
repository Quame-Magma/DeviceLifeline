import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so the WebView never dies as a silent blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            fontFamily: 'Segoe UI, system-ui, sans-serif',
            background: '#070b14',
            color: '#f1f5f9',
          }}
        >
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>
            DeviceLifeline hit a display error
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>
            The window opened, but the UI failed to render. Details:
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: 12,
              fontSize: 12,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            style={{
              marginTop: 16,
              padding: '8px 14px',
              background: 'linear-gradient(180deg,#22d3ee,#06b6d4)',
              color: '#070b14',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
