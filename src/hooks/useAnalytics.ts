import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';

/**
 * Analytics event names used throughout the app.
 * Centralizing these helps prevent typos and makes it easy to see all tracked events.
 */
export const AnalyticsEvents = {
  // Page/view tracking
  PAGE_VIEW: '$pageview',
  
  // User lifecycle
  FIRST_VISIT: 'first_visit',
  
  // Core features
  PARSE_SUBMITTED: 'parse_submitted',
  PARSE_COMPLETED: 'parse_completed',
  PARSE_FAILED: 'parse_failed',
  DICTIONARY_OPENED: 'dictionary_opened',
  
  // UI interactions
  HELP_OPENED: 'help_opened',
  THEME_TOGGLED: 'theme_toggled',
} as const;

export type AnalyticsEvent = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];

/**
 * Hook for tracking analytics events.
 * Provides a type-safe wrapper around PostHog's capture method.
 * 
 * If PostHog is not configured (no API key), all tracking calls are no-ops.
 */
export function useAnalytics() {
  const posthog = usePostHog();

  /**
   * Track a custom event with optional properties.
   */
  const trackEvent = useCallback(
    (event: AnalyticsEvent | string, properties?: Record<string, unknown>) => {
      posthog?.capture(event, properties);
    },
    [posthog]
  );

  /**
   * Track a page view. Use this when the view state changes since we don't have a router.
   */
  const trackPageView = useCallback(
    (page: string) => {
      posthog?.capture(AnalyticsEvents.PAGE_VIEW, {
        page,
        $current_url: window.location.href,
      });
    },
    [posthog]
  );

  return {
    trackEvent,
    trackPageView,
    posthog,
  };
}
