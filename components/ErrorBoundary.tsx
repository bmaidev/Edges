"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Shown in place of the crashed subtree. Keep it calm — a participant seeing
  // this is mid-workshop on their phone.
  fallback?: ReactNode;
  // Lets the boundary auto-recover when the surrounding state moves on (e.g. the
  // facilitator advances the phase). Change this key to reset after a crash.
  resetKey?: string | number;
  label?: string; // for logging which surface failed
}

interface State {
  error: Error | null;
}

// Catches render/runtime errors in a module renderer so a single malformed view
// degrades to a quiet message instead of a blank white screen for the whole
// session. Resets automatically when `resetKey` changes (next poll / new phase).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Content-free by design: log the message + which surface, never view data.
    console.error(`[render] ${this.props.label ?? "renderer"} crashed: ${error.message}`);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="max-w-xs text-lg leading-relaxed text-white/90">
              Something hiccuped on this screen.
            </p>
            <p className="max-w-xs text-sm text-muted">
              It&apos;ll sort itself out when the facilitator moves on — nothing
              you did, and nothing was lost.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
