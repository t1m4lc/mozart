// Public surface of `desktop-core-data-access`. Abstract ports for
// cross-cutting platform services. Concrete Tauri-bound impls live
// in apps/desktop/src/app/core/ and are bound to these abstract
// classes via `useExisting` in app.config.
//
// Lets feature libs (`desktop-<domain>-feature`) inject these
// services without dragging Tauri into their dependency graph.

export { ExternalLinkService } from './lib/external-link.service';
export { ConnectivityService } from './lib/connectivity.service';
export {
  NotificationService,
  type NotificationPrefsCache,
} from './lib/notification.service';
export { WindowFocusService } from './lib/window-focus.service';
