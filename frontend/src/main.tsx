import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { reportClientError } from "./lib/observability";
import "./index.css";

/**
 * Global error handlers (Phase 19).
 *
 * `window.onerror` catches errors that escaped React (for example an error
 * thrown in an event handler) and `unhandledrejection` catches promise
 * rejections nobody handled. Both are reported to the backend when client
 * error reporting is enabled, and always logged to the browser console.
 */
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const error = event.error;
    // eslint-disable-next-line no-console
    console.error("[global] uncaught error:", error ?? event.message);
    reportClientError({
      component: "window",
      message: error?.message ?? event.message ?? "Uncaught error",
      stack: error?.stack,
      kind: "uncaught_error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    // eslint-disable-next-line no-console
    console.error("[global] unhandled promise rejection:", reason);
    reportClientError({
      component: "promise",
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      kind: "unhandled_rejection",
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Last line of defence: a crash anywhere below renders a friendly
        fallback instead of an empty page. */}
    <ErrorBoundary label="application">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
