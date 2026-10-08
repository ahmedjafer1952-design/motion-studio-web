import { Component, type ReactNode } from "react";

const AUTOSAVE_KEY = "motion-studio-autosave";

/** Keeps a rendering bug from leaving a blank page: offers a reload or a clean start instead. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Editor crashed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <h2>Something went wrong</h2>
        <p className="hint">Your media files are safe. Try reloading first; if it keeps happening, start a fresh project.</p>
        <pre>{this.state.error.message}</pre>
        <div className="modal-actions">
          <button onClick={() => window.location.reload()}>Reload</button>
          <button
            className="primary"
            onClick={() => {
              try {
                localStorage.removeItem(AUTOSAVE_KEY);
              } catch {
                // nothing to clear
              }
              window.location.reload();
            }}
          >
            Start a fresh project
          </button>
        </div>
      </div>
    );
  }
}
