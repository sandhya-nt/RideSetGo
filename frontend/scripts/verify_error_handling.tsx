/**
 * Frontend resilience verification (Phase 19).
 *
 * The project has no JavaScript test runner and this phase deliberately adds
 * no new dependency, so the checks below are executed with the tooling that
 * is already installed: `esbuild` (bundled with Vite) to compile the TSX and
 * `react-dom/server` to render the React tree.
 *
 * Run from the `frontend` directory:
 *     node scripts/verify_error_handling.mjs
 *
 * The script is bundled first:
 *     npx esbuild scripts/verify_error_handling.tsx --bundle --platform=node \
 *       --format=esm --outfile=scripts/.verify_error_handling.mjs \
 *       --alias:@=./src --external:react --external:react-dom \
 *       --loader:.css=empty
 *     node scripts/.verify_error_handling.mjs
 *
 * Alternatively, run `npm run verify:resilience` which does both steps.
 */
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  normalizeApiError,
  isSessionExpired,
  isNetworkError,
  looksLikeStackTrace,
} from "@/lib/errors";
import { newIdempotencyKey, newRequestId } from "@/lib/observability";

let failures = 0;
let passes = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passes += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Render a React tree to HTML.
 *
 * `renderToPipeableStream` is used instead of `renderToString` because only
 * the streaming renderer honours error boundaries: `renderToString` re-throws
 * the error instead of rendering the fallback.
 */
function renderToHtml(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const sink = new PassThrough();
    sink.on("data", (chunk) => chunks.push(chunk.toString()));
    sink.on("end", () => resolve(chunks.join("")));
    sink.on("error", reject);

    const { pipe } = renderToPipeableStream(element, {
      onError(error: unknown) {
        // Errors handled by an error boundary are rendered as the fallback,
        // so they must not abort the stream.
        if (error instanceof Error && error.message === "kaboom") return "handled";
        console.error("render error:", error);
        return "handled";
      },
    });
    pipe(sink);
  });
}

/** Build a minimal axios-shaped error for the normaliser. */
function axiosError(
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): unknown {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    name: "AxiosError",
    config: { headers: {} },
    response: { status, data, headers },
  };
}

// ---------------------------------------------------------------------------
// 1. The error boundary
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const healthyHtml = await renderToHtml(
    React.createElement(
      ErrorBoundary,
      { label: "test" },
      React.createElement("p", null, "child content"),
    ),
  );
  check(
    "error boundary renders its children when nothing throws",
    healthyHtml.includes("child content"),
  );

  function Boom(): React.ReactElement {
    throw new Error("kaboom");
  }

  // React's server renderers re-throw an error thrown during the *initial*
  // render, so the boundary is driven through the same state transition React
  // performs itself: `getDerivedStateFromError` puts the boundary into the
  // error state, and `render()` then returns the fallback.
  const derived = ErrorBoundary.getDerivedStateFromError(new Error("kaboom"));
  check(
    "getDerivedStateFromError puts the boundary into the error state",
    derived.error instanceof Error && derived.error.message === "kaboom",
  );

  const boundary = new ErrorBoundary({
    children: React.createElement(Boom),
    label: "test",
  });
  boundary.state = { error: new Error("kaboom") };
  const fallbackHtml = await renderToHtml(
    boundary.render() as React.ReactElement,
  );
  check(
    "the boundary renders a fallback UI once it has caught an error",
    fallbackHtml.includes("could not be displayed"),
    fallbackHtml.slice(0, 300),
  );
  check(
    "the fallback offers a retry action",
    fallbackHtml.includes("Try again"),
  );
  check(
    "the fallback does not dump a raw stack trace",
    !fallbackHtml.includes("at Boom") && !fallbackHtml.includes("ErrorBoundary.tsx"),
  );
  check(
    "the fallback does not blame the user",
    !fallbackHtml.toLowerCase().includes("your fault"),
  );

  // `componentDidCatch` must never throw — it reports the failure and logs
  // it to the console.
  const originalError = console.error;
  let logged = false;
  console.error = (...args: unknown[]) => {
    logged = true;
    void args;
  };
  try {
    boundary.componentDidCatch(new Error("kaboom"), {
      componentStack: "\n    at Boom",
    } as React.ErrorInfo);
  } finally {
    console.error = originalError;
  }
  check(
    "componentDidCatch reports the failure without throwing",
    logged,
  );

  // -------------------------------------------------------------------------
  // 2. API error normalisation
  // -------------------------------------------------------------------------

  const unauthorized = normalizeApiError(
    axiosError(401, { detail: "Invalid or expired token" }),
  );
  check(
    "a 401 is reported as an expired session",
    unauthorized.kind === "unauthorized",
  );
  check("a 401 is not retryable", unauthorized.retryable === false);
  check(
    "a 401 produces a user friendly message",
    !unauthorized.message.includes("token"),
  );

  const forbidden = normalizeApiError(axiosError(403, { detail: "Not authorized" }));
  check(
    "a 403 is forbidden and never logs the user out",
    forbidden.kind === "forbidden",
  );

  const serverError = normalizeApiError(
    axiosError(500, { detail: "Internal server error" }),
  );
  check(
    "a 500 is a retryable server error",
    serverError.kind === "server" && serverError.retryable,
  );

  const networkError = normalizeApiError({
    isAxiosError: true,
    message: "Network Error",
    name: "AxiosError",
    config: { headers: {} },
    response: undefined,
  });
  check(
    "a request that never reached the server is a network error",
    networkError.kind === "network" && networkError.retryable,
  );
  check(
    "a network error is recognised by isNetworkError",
    isNetworkError(networkError),
  );
  check(
    "a session expiry is recognised by isSessionExpired",
    isSessionExpired(unauthorized) && !isSessionExpired(networkError),
  );

  const withTrace = normalizeApiError(
    axiosError(500, {
      detail:
        'Traceback (most recent call last):\n  File "app/main.py", line 42, in handler\n    raise ValueError',
    }),
  );
  check(
    "a stack trace in the response body is never shown to the user",
    !withTrace.message.includes("Traceback") && !withTrace.message.includes("main.py"),
  );

  const validation = normalizeApiError(
    axiosError(422, {
      detail: "Request validation failed",
      errors: [
        { field: "body.email", message: "value is not a valid email address" },
      ],
    }),
  );
  check("a 422 is a validation error", validation.kind === "validation");
  check(
    "a 422 keeps the field level messages",
    (validation.fieldErrors ?? []).length === 1 &&
      validation.fieldErrors?.[0].field === "body.email",
  );

  const withReference = normalizeApiError(
    axiosError(500, { detail: "boom", request_id: "abc123" }),
  );
  check(
    "the backend request id is preserved for support",
    withReference.requestId === "abc123",
  );

  const fromHeader = normalizeApiError(
    axiosError(503, { detail: "unavailable" }, { "x-request-id": "from-header" }),
  );
  check(
    "the request id is also read from the response header",
    fromHeader.requestId === "from-header",
  );

  check(
    "a stack trace is detected by looksLikeStackTrace",
    looksLikeStackTrace('Traceback (most recent call last):\n  File "x.py"'),
  );

  const plainError = normalizeApiError(new Error("boom"));
  check(
    "a non-axios error still produces a safe message",
    plainError.kind === "unknown" && !plainError.message.includes("boom"),
  );

  // -------------------------------------------------------------------------
  // 3. Request / idempotency identifiers
  // -------------------------------------------------------------------------

  const ids = new Set<string>();
  for (let i = 0; i < 200; i += 1) ids.add(newRequestId());
  check("request ids are unique", ids.size === 200);

  const key = newIdempotencyKey();
  check(
    "an idempotency key is safe to use as an HTTP header value",
    /^[A-Za-z0-9._:-]{1,128}$/.test(key),
    key,
  );

  // -------------------------------------------------------------------------

  console.log("");
  console.log(`${passes} passed, ${failures} failed`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main();
