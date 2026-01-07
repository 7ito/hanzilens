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
  // Autocapture settings
  autocapture: true,
  capture_pageview: false, // We handle this manually since there's no router
  capture_pageleave: true,
  // Session replay settings (5K free recordings/month)
  disable_session_recording: false,
  session_recording: {
    maskAllInputs: false, // Don't mask - Chinese text input is useful to see
    maskTextSelector: undefined,
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
