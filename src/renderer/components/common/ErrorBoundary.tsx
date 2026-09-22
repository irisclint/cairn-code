import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ErrorBoundaryProps {
  /** Name of the region being guarded, shown in the fallback message. */
  region: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Keeps one broken region from taking down the whole workbench.
 *
 * Every major view is wrapped in its own boundary, so a crash in the terminal
 * panel still leaves the editor usable and the user keeps the chance to save.
 * The fallback follows the cairn-code error contract: what happened, why, and what
 * to do next.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[' + this.props.region + '] crashed:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private readonly retry = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <Icon name="error" size={24} className="error-boundary__icon" />
        <h2 className="error-boundary__title">The {this.props.region} stopped responding</h2>
        <p className="error-boundary__message">{error.message}</p>
        <p className="error-boundary__cause">
          Cause: an unhandled error was thrown while rendering this region. The rest of cairn-code is unaffected,
          so any unsaved work can still be saved.
        </p>
        <p className="error-boundary__solution">
          Fix: save your open files, then reload this region. If it keeps failing, report the issue with the
          stack trace below.
        </p>
        <div className="error-boundary__actions">
          <button type="button" className="button" onClick={this.retry}>
            Reload {this.props.region}
          </button>
        </div>
        {this.state.componentStack ? (
          <details className="error-boundary__details">
            <summary>Stack trace</summary>
            <pre>{error.stack ?? error.message}</pre>
            <pre>{this.state.componentStack}</pre>
          </details>
        ) : null}
      </div>
    );
  }
}
