import type { Signal } from '@angular/core';

// Abstract port for the browser-online + Anthropic-reachability gate
// used by the shell offline notice and the profile connection card.
// The concrete Tauri-bound impl (probe via Rust) lives in
// apps/desktop/src/app/core/. app.config wires the binding so libs
// `inject(ConnectivityService)` without needing `core/_bindings`.
export abstract class ConnectivityService {
  abstract readonly online: Signal<boolean>;
  abstract readonly apiReachable: Signal<boolean>;
  abstract readonly connected: Signal<boolean>;

  /** Force a probe now. Returns the new `connected` value. */
  abstract refresh(): Promise<boolean>;
}
