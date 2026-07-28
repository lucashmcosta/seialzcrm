import React from "react";
import * as Sentry from "@sentry/react";
import { isStaleChunkError, reloadForChunkRecovery } from "@/App";

/**
 * Error boundary around the global call handlers subtree.
 *
 * The Twilio Voice SDK is loaded lazily inside InboundCallHandler /
 * OutboundCallHandler. Its own runtime performs dynamic imports (workers,
 * audio helpers) and fetches CDN assets (ringtones, DTMF sounds). Those
 * network requests can be blocked by ad blockers, restrictive CSPs, corporate
 * proxies, or Safari ITP — the SDK then rejects with "Importing a module
 * script failed" / "Failed to fetch dynamically imported module".
 *
 * These rejections escape our own retryImport/lazyWithRetry (which only wrap
 * our lazy() factories, not third-party SDK internals) and bubble up during
 * render, hitting the root Sentry ErrorBoundary → white screen.
 *
 * Call handlers are non-essential (only active when voice is enabled). If the
 * SDK cannot load, the right thing is to silently render null so the rest of
 * the app keeps working. Non-import errors are re-thrown for the parent
 * boundary to handle.
 */

const TWILIO_IMPORT_PATTERNS = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "module script",
];

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

function stackOf(error: unknown): string {
  if (error instanceof Error && typeof error.stack === "string") return error.stack;
  if (error && typeof error === "object" && "stack" in error) {
    const s = (error as { stack?: unknown }).stack;
    if (typeof s === "string") return s;
  }
  return "";
}

function isTwilioImportError(error: unknown): boolean {
  const msg = messageOf(error).toLowerCase();
  const stack = stackOf(error).toLowerCase();
  const matchesPattern = TWILIO_IMPORT_PATTERNS.some((p) => msg.includes(p));
  if (!matchesPattern) return false;
  // Only silence when the failure looks Twilio-originated. If our own code is
  // in the stack we let it propagate.
  return stack.includes("twilio") || stack.includes("voice-sdk") || stack === "";
}

interface State {
  suppressed: boolean;
}

export class CallHandlersBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { suppressed: false };

  static getDerivedStateFromError(error: unknown): State | null {
    if (isStaleChunkError(error)) {
      reloadForChunkRecovery();
      return { suppressed: true };
    }
    if (isTwilioImportError(error)) {
      return { suppressed: true };
    }
    // Let the parent boundary handle unknown errors.
    return null;
  }

  componentDidCatch(error: unknown): void {
    if (isStaleChunkError(error) || isTwilioImportError(error)) {
      try {
        Sentry.addBreadcrumb({
          category: "call-handlers",
          level: "warning",
          message: "call_handlers_suppressed",
          data: {
            message: messageOf(error).slice(0, 200),
          },
        });
      } catch {
        // ignore
      }
      return;
    }
    // Re-throw so the outer ErrorBoundary sees it. React swallows throws in
    // componentDidCatch, so we rely on getDerivedStateFromError returning null
    // to keep this instance in an "unhandled" state — but React actually
    // still marks the boundary as caught. To force propagation we throw
    // during the next render via a flag.
    this.setState(() => {
      throw error;
    });
  }

  render() {
    if (this.state.suppressed) return null;
    return this.props.children;
  }
}

export default CallHandlersBoundary;
