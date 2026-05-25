import { getCurrentWindow } from '@tauri-apps/api/window';
import type { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import type { SessionStore } from '@mozart/desktop-ui-state-data-access';

// Flush in-memory edit buffers to disk on app close. Drafts are NOT
// persisted to localStorage in steady state — they live in SessionStore
// for the session, and we write them on a clean close via Tauri's
// `onCloseRequested` (preventDefault + await saves + destroy). A hard
// crash / OS kill loses these — that's the accepted trade-off; an
// explicit Save button gives the user a deterministic checkpoint.
export async function registerCloseFlush(
  sessionStore: SessionStore,
  repos: RepositoriesFacade,
): Promise<void> {
  try {
    const win = getCurrentWindow();
    await win.onCloseRequested(async (event) => {
      const edits = sessionStore.allDirtyEdits();
      if (edits.length === 0) return; // nothing to flush — let close proceed
      event.preventDefault();
      try {
        const results = await Promise.allSettled(
          edits.map((e) =>
            repos.saveFile(e.workspaceId, e.path, e.content, e.baseHash),
          ),
        );
        // Surface per-save failures so the user can see what was lost
        // after relaunch. Don't block the close — a hung file shouldn't
        // trap them in the app.
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const e = edits[i];
            console.warn(
              `[close] save failed for ${e.workspaceId}:${e.path}:`,
              r.reason,
            );
          }
        });
      } finally {
        await win.destroy();
      }
    });
  } catch (err) {
    // Tauri window API not available (e.g. running in a plain browser
    // for tests). The close-flush is a Tauri-only safety net.
    console.warn('[close] could not register flush handler:', err);
  }
}
