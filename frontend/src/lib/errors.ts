/**
 * API error normalisation for RideSetGo (Phase 19).
 *
 * Every backend call can fail in a different way: the network can be down,
 * the session can expire, the server can return a validation problem or an
 * internal error. This module turns all of those into one predictable shape
 * so that screens do not each invent their own error handling.
 *
 * Rules enforced here:
 *   * The user never sees a raw backend stack trace. If a response body
 *     looks like a traceback it is replaced with a generic message.
 *   * A session expiry (HTTP 401) is always reported as such, so the app can
 *     send the user back to the login screen exactly once.
 *   * A network failure is always reported as such, so the app can offer a
 *     retry that keeps the user's input instead of showing a dead end.
 *   * The backend request id is preserved so a user can quote a short
 *     reference that maps to a single log line.
 */

import axios, { AxiosError } from "axios";

export type ApiErrorKind =
  | "offline"
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "server"
  | "unknown";

export interface FieldError {
  field: string;
  message: string;
}

export interface NormalizedApiError {
  /** Machine readable category. */
  kind: ApiErrorKind;
  /** Safe, user facing message. Never contains a stack trace. */
  message: string;
  /** HTTP status code, when the server answered. */
  status?: number;
  /** Backend request id — quote this in a bug report. */
  requestId?: string;
  /** True when trying the same request again may succeed. */
  retryable: boolean;
  /** Field level validation problems (HTTP 422). */
  fieldErrors?: FieldError[];
  /** The original error object, for logging only. */
  raw?: unknown;
}

const TRACE_PATTERNS = [
  /traceback \(most recent call last\)/i,
  /file "\/.*", line \d+/i,
  /\bat [\w.$<>]+ \([^)]*:\d+:\d+\)/,
];

/** True when the text looks like a stack trace and must not be shown. */
export function looksLikeStackTrace(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return TRACE_PATTERNS.some((pattern) => pattern.test(value));
}

function readRequestId(
  error: AxiosError | undefined,
  body: unknown,
): string | undefined {
  const fromBody =
    body && typeof body === "object" && "request_id" in body
      ? String((body as { request_id?: unknown }).request_id ?? "")
      : "";
  if (fromBody) return fromBody;

  const fromHeader = error?.response?.headers?.["x-request-id"];
  if (typeof fromHeader === "string" && fromHeader) return fromHeader;

  const fromRequest = error?.config?.headers?.["X-Request-ID"];
  if (typeof fromRequest === "string" && fromRequest) return fromRequest;

  return undefined;
}

function readFieldErrors(body: unknown): FieldError[] | undefined {
  if (!body || typeof body !== "object" || !("errors" in body)) return undefined;
  const raw = (body as { errors?: unknown }).errors;
  if (!Array.isArray(raw)) return undefined;
  const fields: FieldError[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const field = String((item as { field?: unknown }).field ?? "");
    const message = String((item as { message?: unknown }).message ?? "");
    if (!field || !message) continue;
    fields.push({ field, message });
  }
  return fields.length ? fields : undefined;
}

function safeDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "string") return undefined;
  const trimmed = detail.trim();
  if (!trimmed) return undefined;
  if (looksLikeStackTrace(trimmed)) return undefined;
  if (trimmed.length > 300) return `${trimmed.slice(0, 300)}…`;
  return trimmed;
}

const API_ERROR_KINDS: ApiErrorKind[] = [
  "offline",
  "network",
  "timeout",
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "conflict",
  "rate_limited",
  "server",
  "unknown",
];

function isNormalizedApiError(value: unknown): value is NormalizedApiError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NormalizedApiError>;
  return (
    typeof candidate.message === "string" &&
    typeof candidate.kind === "string" &&
    (API_ERROR_KINDS as string[]).includes(candidate.kind)
  );
}

/**
 * Convert any thrown value into a {@link NormalizedApiError}.
 *
 * Never throws and never returns a raw stack trace. Calling it on an already
 * normalised error returns that error unchanged, so the function is
 * idempotent and safe to apply more than once.
 */
export function normalizeApiError(error: unknown): NormalizedApiError {
  if (isNormalizedApiError(error)) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data;
    const requestId = readRequestId(error, body);
    const detail = safeDetail(body);
    const fieldErrors = readFieldErrors(body);

    if (error.code === "ERR_CANCELED") {
      return {
        kind: "unknown",
        message: "The request was cancelled.",
        status,
        requestId,
        retryable: true,
        raw: error,
      };
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return {
        kind: "timeout",
        message: "The server took too long to respond. Please try again.",
        status,
        requestId,
        retryable: true,
        raw: error,
      };
    }

    if (!error.response) {
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      return {
        kind: offline ? "offline" : "network",
        message: offline
          ? "You appear to be offline. Check your connection and try again."
          : "Network error. Please check your connection and try again.",
        requestId,
        retryable: true,
        raw: error,
      };
    }

    if (status === 401) {
      return {
        kind: "unauthorized",
        message: "Your session has expired. Please sign in again.",
        status,
        requestId,
        retryable: false,
        raw: error,
      };
    }

    if (status === 403) {
      return {
        kind: "forbidden",
        message: "You do not have permission to do that.",
        status,
        requestId,
        retryable: false,
        raw: error,
      };
    }

    if (status === 404) {
      return {
        kind: "not_found",
        message: detail ?? "We could not find what you were looking for.",
        status,
        requestId,
        retryable: false,
        raw: error,
      };
    }

    if (status === 409) {
      return {
        kind: "conflict",
        message:
          detail ??
          "That request conflicts with something that already happened.",
        status,
        requestId,
        retryable: false,
        raw: error,
      };
    }

    if (status === 422) {
      return {
        kind: "validation",
        message: detail ?? "Please check the details you entered.",
        status,
        requestId,
        retryable: false,
        fieldErrors,
        raw: error,
      };
    }

    if (status === 429) {
      return {
        kind: "rate_limited",
        message: "Too many requests. Please wait a moment and try again.",
        status,
        requestId,
        retryable: true,
        raw: error,
      };
    }

    if (typeof status === "number" && status >= 500) {
      return {
        kind: "server",
        message: "The server ran into a problem. Please try again in a moment.",
        status,
        requestId,
        retryable: true,
        raw: error,
      };
    }

    return {
      kind: "unknown",
      message: detail ?? "Something went wrong. Please try again.",
      status,
      requestId,
      retryable: true,
      raw: error,
    };
  }

  if (error instanceof Error) {
    return {
      kind: "unknown",
      message: "Something went wrong. Please try again.",
      retryable: true,
      raw: error,
    };
  }

  return {
    kind: "unknown",
    message: "Something went wrong. Please try again.",
    retryable: true,
    raw: error,
  };
}

/** True when the failure was caused by an expired or invalid session. */
export function isSessionExpired(error: unknown): boolean {
  return normalizeApiError(error).kind === "unauthorized";
}

/** True when the request never reached the server. */
export function isNetworkError(error: unknown): boolean {
  const kind = normalizeApiError(error).kind;
  return kind === "network" || kind === "offline" || kind === "timeout";
}

/** True when the user can safely press "Try again" for the same request. */
export function isRetryable(error: unknown): boolean {
  return normalizeApiError(error).retryable;
}

/**
 * Return the first field error for a given field name, if any.
 * Useful to show the message next to the right input.
 */
export function fieldError(
  error: unknown,
  fieldName: string,
): string | undefined {
  const normalized = normalizeApiError(error);
  if (!normalized.fieldErrors) return undefined;
  const match = normalized.fieldErrors.find(
    (item) =>
      item.field === fieldName ||
      item.field.endsWith(`.${fieldName}`) ||
      item.field === `body.${fieldName}`,
  );
  return match?.message;
}
