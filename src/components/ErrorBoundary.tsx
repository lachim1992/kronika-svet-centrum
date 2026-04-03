import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-6 text-center space-y-3">
            <div className="text-destructive text-lg font-bold">⚠ Chyba vykreslení</div>
            <pre className="text-xs text-muted-foreground bg-muted/30 rounded p-3 overflow-auto max-h-40 text-left">
              {this.state.error?.message}
            </pre>
            <button
              className="text-sm text-primary underline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Zkusit znovu
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
