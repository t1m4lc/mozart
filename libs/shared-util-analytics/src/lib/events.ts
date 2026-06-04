// Single source of truth for every manually-captured analytics event name.
//
// Why this file exists: event names are the contract between the code and the
// PostHog funnels/insights. A typo or a drifting name silently breaks a funnel.
// Capturing goes through `AnalyticsService.capture()` /
// `DesktopAnalyticsFacade.track()`, both typed to `AnalyticsEventName`, so the
// compiler rejects any event that isn't listed here.
//
// Keep in lockstep with:
//   - docs/engineering/analytics/ANALYTICS_REFERENCE.md  (the catalog)
//   - docs/engineering/analytics/ANALYTICS_POSTHOG_FUNNELS.md  (funnel steps)
// Adding/renaming an event = edit this map, then the reference doc, then the
// PostHog funnel that consumes it.
//
// Not listed: `$pageview` (auto-captured by PostHog via `capture_pageview`;
// "landing_viewed" in the funnels is `$pageview` filtered to the landing
// surface — there is no manual capture for it).

export const ANALYTICS_EVENTS = {
  // Acquisition — landing (Funnel 1)
  downloadCtaClicked: 'download_cta_clicked',
  downloaded: 'downloaded',

  // Authentication — web (Funnel 1→2 handoff)
  signupCompleted: 'signup_completed',
  loginCompleted: 'login_completed',

  // Authentication — desktop (Funnel 2)
  desktopAuthenticated: 'desktop_authenticated',

  // Onboarding & Activation — desktop (Funnels 2/3/4)
  onboardingCompleted: 'onboarding_completed',
  projectAdded: 'project_added',
  workspaceCreated: 'workspace_created',
  agentCompleted: 'agent_completed',

  // Product value — desktop (Funnel 4)
  prCreated: 'pr_created',

  // Configuration — desktop (provider mix)
  providerConnected: 'provider_connected',
} as const;

/** Union of every approved event-name string. */
export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
