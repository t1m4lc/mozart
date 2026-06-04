// Abstract port for desktop telemetry config: the anonymous install id used
// as the pre-auth PostHog distinct_id, and the consent flag every capture is
// gated on. The concrete Tauri-bound impl (reads/writes the config KV via
// Rust) lives in desktop-core-tauri; app.config wires the binding so libs
// `inject(AnalyticsConfigPort)` without dragging `@tauri-apps/*` into their
// build graph.
export abstract class AnalyticsConfigPort {
  /** Stable anonymous install id, generated + persisted on first read. */
  abstract getOrCreateInstallId(): Promise<string>;
  /** Telemetry consent. Defaults to `true` for the private beta. */
  abstract getTelemetryOptIn(): Promise<boolean>;
  abstract setTelemetryOptIn(value: boolean): Promise<void>;
}
