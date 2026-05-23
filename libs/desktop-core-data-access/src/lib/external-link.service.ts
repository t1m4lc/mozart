// Abstract port for opening URLs in the user's default browser. The
// concrete Tauri-bound impl lives in apps/desktop/src/app/core/ —
// this lib stays free of `@tauri-apps/*` imports so feature libs can
// `inject(ExternalLinkService)` without dragging Tauri into their
// dependency graph. app.config binds the impl via
// `{ provide: ExternalLinkService, useExisting: TauriExternalLinkService }`.
export abstract class ExternalLinkService {
  abstract openExternal(url: string): Promise<void>;
}
