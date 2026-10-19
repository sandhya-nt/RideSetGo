/**
 * ErrorBoundary — RideSetGo Phase 19.
 *
 * A reusable React error boundary. It catches render errors anywhere in its
 * subtree, shows a friendly fallback instead of a blank screen, and reports
 * the failure to the backend (when client error reporting is enabled).
 *
 * Design rules:
 *   * The fallback is user friendly: a short explanation, a "Try again"
 *     button and, when available, the backend request id so a user can quote
 *     it in a support request.
 *   * No raw stack trace is rendered as the primary message. The technical
 *     detail is available in a collapsed <details> block for developers.
 *   * The boundary can be reset, which re-mounts the subtree — that is what
 *     makes "Try again" useful for a transient failure.
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportClientError } from "@/lib/observability";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  /** Human readable name of the area being protected (used in reports). */
  label?: string;
  /** Called after the boundary has been reset. */
  onReset?: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Always log locally, even when backend reporting is disabled, so the
    // failure is visible in the browser console during development.
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary] ${this.props.label ?? "app"} failed to render:`,
      error,
      info.componentStack,
    );

    reportClientError({
      component: this.props.label ?? "app",
      message: error?.message ?? "Unknown render error",
      stack:
        info.componentStack && error?.stack
          ? `${error.stack}\n${info.componentStack}`
          : error?.stack,
      kind: "render_error",
    });
  }

  handleReset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback } = this.props;
    if (typeof fallback === "function") {
      return fallback(error, this.handleReset);
    }
    if (fallback) return fallback;

    return (
      <ErrorFallback
        error={error}
        label={this.props.label}
        onReset={this.handleReset}
      />
    );
  }
}

/**
 * The default fallback UI. Exported so a page can reuse the same look for
 * an error it handled itself.
 */
export function ErrorFallback({
  error,
  label,
  onReset,
}: {
  error: Error;
  label?: string;
  onReset?: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-rsgo-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800">
          This screen could not be displayed
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Something went wrong while rendering
          {label ? ` the ${label} screen` : " this screen"}. Your trip and
          account data are unaffected. Please try again.
        </p>

        <button
          onClick={onReset}
          className="btn-primary mt-6 inline-flex items-center justify-center gap-2 px-4 py-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>

        <details className="mt-5 text-left">
          <summary className="text-xs text-gray-400 cursor-pointer select-none">
            Technical details
          </summary>
          <pre className="mt-2 text-[11px] leading-relaxed text-gray-500 bg-gray-50 rounded p-3 whitespace-pre-wrap break-all max-h-40 overflow-auto">
            {error?.message?.slice(0, 500) ?? "Unknown error"}
          </pre>
        </details>
      </div>
    </div>
  );
}

export default ErrorBoundary;
