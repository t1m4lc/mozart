// Abstract ports bound to concrete Tauri impls (in apps/desktop/src/app/core/)
// via `useExisting` in app.config — keeps Tauri out of the feature-lib graph.

export { ExternalLinkService } from './lib/external-link.service';
export { ConnectivityService } from './lib/connectivity.service';
export {
  NotificationService,
  type NotificationPrefsCache,
} from './lib/notification.service';
export { WindowFocusService } from './lib/window-focus.service';
export { AnalyticsConfigPort } from './lib/analytics-config.port';
export { DesktopAnalyticsFacade } from './lib/desktop-analytics.facade';
