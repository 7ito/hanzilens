import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { PostHogProvider } from "posthog-js/react"

import "./index.css"
import App from "./App.tsx"
import { ErrorBoundary } from "./components/ErrorBoundary.tsx"

// PostHog configuration - only initialize if API key is provided
const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com"

const posthogOptions = {
  api_host: posthogHost,
  ui_host: "https://us.posthog.com", // Required when using reverse proxy
  // Autocapture settings
  autocapture: true,
  capture_pageview: false, // We handle this manually since there's no router
  capture_pageleave: true,
  // Session replay is disabled to avoid recording user-entered Chinese text or OCR results.
  disable_session_recording: true,
  session_recording: {
    maskAllInputs: true,
  },
  // Persistence
  persistence: "localStorage" as const,
  // Don't track localhost by default in development
  loaded: (posthog: { debug: (enabled: boolean) => void }) => {
    if (import.meta.env.DEV) {
      posthog.debug(true)
    }
  },
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {posthogKey ? (
        <PostHogProvider apiKey={posthogKey} options={posthogOptions}>
          <App />
        </PostHogProvider>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>
)
