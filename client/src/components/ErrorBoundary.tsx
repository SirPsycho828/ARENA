import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-arena-base flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md px-6">
            <h1 className="font-display text-3xl font-bold text-arena-magenta">Arena Error</h1>
            <p className="text-arena-text-secondary">Something went wrong. Please refresh the page.</p>
            <pre className="text-xs text-arena-text-muted bg-arena-surface rounded-lg p-4 overflow-auto max-h-32 text-left">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-arena-cyan text-arena-base font-bold rounded-lg cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
