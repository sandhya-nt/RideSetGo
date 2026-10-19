import { Loader2, RefreshCw } from "lucide-react";

export function Skeleton({ className = "h-4 w-full bg-gray-200 rounded" }: { className?: string }) {
  return <div className={`animate-pulse ${className}`} />;
}

export function RideCardSkeleton() {
  return (
    <div className="card p-4 flex items-center justify-between gap-4 bg-white">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="h-4 w-16 ml-auto" />
        <Skeleton className="h-3 w-20 ml-auto" />
        <Skeleton className="h-3 w-12 ml-auto" />
      </div>
    </div>
  );
}

export function LoadingSpinner({
  className = "w-5 h-5",
}: { className?: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className={`animate-spin ${className} text-rsgo-600`} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <p className="text-gray-500 mt-2 max-w-xs">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-100 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <span className="text-red-500">⚠</span>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">Error</h3>
          <div className="mt-0.5 text-sm text-red-700">{message}</div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function SuccessAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="rounded-lg bg-green-50 border border-green-100 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <span className="text-green-500">✓</span>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-green-800">Success</h3>
          <div className="mt-0.5 text-sm text-green-700">{message}</div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-green-400 hover:text-green-600"
            aria-label="Dismiss success"
          >
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A failure state with a retry action (Phase 19).
 *
 * Used wherever a screen loads data that can fail. The message always comes
 * from the normalised API error, so it never contains a backend stack trace,
 * and the optional reference shows the backend request id so a user can
 * quote it in a support request.
 */
export function RetryableError({
  message,
  onRetry,
  reference,
  retrying = false,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  reference?: string;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-red-50 border border-red-100 p-4 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <span className="text-red-500">⚠</span>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">Error</h3>
          <div className="mt-0.5 text-sm text-red-700">{message}</div>
          {reference && (
            <div className="mt-1 text-[11px] text-red-400">
              Reference for support: {reference}
            </div>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`}
              />
              {retrying ? "Retrying…" : "Try again"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
