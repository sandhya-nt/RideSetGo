/**
 * Frontend observability helpers for RideSetGo (Phase 19).
 *
 * Two responsibilities:
 *
 * 1. **Request correlation** — every API call carries an `X-Request-ID`
 *    header so the frontend error and the backend log line can be matched.
 * 2. **Client error reporting** — render errors and unhandled promise
 *    rejections are reported to the backend, which logs them as structured
 *    records next to the backend errors.
 *
 * Client error reporting is **off by default** and only becomes active when
 * the build sets `VITE_CLIENT_ERROR_REPORTING=true` *and* the backend runs
 * with `ENABLE_CLIENT_ERROR_REPORTING=true`. Without the backend flag the
 * endpoint answers 404 and the report is silently dropped.
 *
 * What is never reported: request or response bodies, cookies, tokens, the
 * user's identity or anything typed into a form. Only the component name, a
 * short error message, a truncated stack, the current route and the request
 * id are sent.
 */

const CLIENT_ERROR_REPORTING_ENABLED =
  import.meta.env?.VITE_CLIENT_ERROR_REPORTING === "true";

const APP_VERSION = import.meta.env?.VITE_APP_VERSION ?? "0.1.0";

/** Maximum length of the error message sent to the backend. */
const MAX_MESSAGE_LENGTH = 500;
/** Maximum length of the stack sent to the backend. */
const MAX_STACK_LENGTH = 4000;

/** Generate a short, unique request id. */
export function newRequestId(): string {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID().replace(/-/g, "");
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `req-${Date.now().toString(16)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Generate an idempotency key for a non-idempotent request.
 *
 * The same key MUST be reused when the user retries the same operation, so
 * the backend can recognise the retry and return the original result instead
 * of creating a duplicate booking or payment.
 */
export function newIdempotencyKey(): string {
  return newRequestId();
}

export type ClientErrorReport = {
  component: string;
  message: string;
  stack?: string;
  route?: string;
  requestId?: string;
  kind?: string;
};

function truncate(value: string, limit: number): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  const { pathname } = window.location;
  // The path only — never the query string, it can hold personal data.
  return pathname ? pathname.slice(0, 200) : "";
}

/**
 * Report a client-side error to the backend.
 *
 * Never throws and never blocks the caller: a failed report must not turn
 * into a second error.
 */
export function reportClientError(
  report: ClientErrorReport,
  endpoint = "/diagnostics/client-errors",
): void {
  if (!CLIENT_ERROR_REPORTING_ENABLED) return;

  const payload = {
    component: truncate(report.component ?? "unknown", 120),
    message: truncate(report.message ?? "", MAX_MESSAGE_LENGTH),
    stack: report.stack ? truncate(report.stack, MAX_STACK_LENGTH) : undefined,
    route: currentRoute(),
    request_id: report.requestId ? truncate(report.requestId, 64) : undefined,
    app_version: APP_VERSION,
    kind: report.kind ? truncate(report.kind, 40) : undefined,
  };

  try {
    const apiBase = import.meta.env?.VITE_API_BASE ?? "/api";
    const url = `${apiBase}${endpoint}`;
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* reporting is best effort */
    });
  } catch {
    /* reporting is best effort */
  }
}

/** True when client error reporting is enabled in this build. */
export function isClientErrorReportingEnabled(): boolean {
  return CLIENT_ERROR_REPORTING_ENABLED;
}
