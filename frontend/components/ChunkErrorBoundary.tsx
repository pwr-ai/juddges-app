"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary to handle ChunkLoadError and other runtime errors
 * Automatically reloads the page when a chunk loading error occurs
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Check if it's a ChunkLoadError
    const isChunkError =
      error.name === "ChunkLoadError" ||
      error.message.includes("Loading chunk") ||
      error.message.includes("Failed to fetch dynamically imported module");

    if (isChunkError) {
      console.error("ChunkLoadError detected, reloading page...", error);

      // Clear service worker cache if present
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }

      // Reload the page to get fresh chunks
      window.location.reload();
    } else {
      console.error("Runtime error: ", error);
    }
  }

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.name === "ChunkLoadError" ||
        this.state.error?.message.includes("Loading chunk");

      if (isChunkError) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="text-center">
              <div className="mb-4 text-4xl">🔄</div>
              <h2 className="mb-2 text-xl font-semibold">Loading updates...</h2>
              <p className="text-muted-foreground">
                The application is being updated. Please wait...
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="max-w-md text-center">
            <div className="mb-4 text-4xl">⚠️</div>
            <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
            <p className="mb-4 text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
