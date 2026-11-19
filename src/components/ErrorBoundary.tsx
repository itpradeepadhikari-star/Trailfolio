import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let parsedMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && typeof parsed.error === 'string') {
          parsedMessage = `${parsed.error} (${parsed.operationType || 'operation'} on ${parsed.path || 'database'})`;
        }
      } catch {
        // Non-JSON error message
      }

      return (
        <div className="min-h-screen bg-[#F6F7FB] text-[#0F172A] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8">
            <p className="text-xs font-mono text-[#475569] mb-2">System Recovery</p>
            <h1 className="text-2xl font-semibold tracking-tight mb-3">
              Something interrupted your trail log
            </h1>
            <p className="text-sm text-[#475569] leading-relaxed mb-6 break-words">
              {parsedMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] text-white rounded-lg hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] trail-transition cursor-pointer"
            >
              Reload Trailfolio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
