import { Injectable, computed, signal } from '@angular/core';
import { OPEN_IN_TOOLS, type OpenInTool, type OpenInToolId } from '@mozart/desktop-workspaces-util';

/**
 * IDE detection cache. Probes via Tauri at boot (and on explicit
 * refresh). Filters `OPEN_IN_TOOLS` to only the IDEs that actually
 * resolved on `$PATH`, plus the tools marked `alwaysAvailable`.
 */
@Injectable({ providedIn: 'root' })
export class IdeDetectionService {
  /** IDs returned by `detect_installed_ides`. Updated by `set`. */
  private readonly detected = signal<readonly OpenInToolId[]>([]);

  /** Available tools = always-available ∪ detected. Order matches the
   *  static catalog so the dropdown is stable. */
  readonly availableTools = computed<readonly OpenInTool[]>(() => {
    const detectedIds = new Set<string>(this.detected());
    return OPEN_IN_TOOLS.filter(
      (t) => t.alwaysAvailable === true || detectedIds.has(t.id),
    );
  });

  set(detectedIds: readonly OpenInToolId[]): void {
    this.detected.set(detectedIds);
  }
}
