import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { commands } from '@mozart/desktop-core-tauri';
import type { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import type { SessionStore } from '@mozart/desktop-ui-state-data-access';

// Flush in-memory edit buffers to disk on app close, and guard against
// quitting out from under a running agent. Drafts are NOT persisted to
// localStorage in steady state — they live in SessionStore for the
// session, and we write them on a clean close via Tauri's
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
      // If agents are still running, confirm before quitting — otherwise
      // we'd orphan their processes. On confirm, kill them; on cancel,
      // abort the close.
      if (await agentsRunning()) {
        event.preventDefault();
        const quit = await ask(
          'An agent is still running. Quit anyway and stop it?',
          {
            title: 'Mozart',
            kind: 'warning',
            okLabel: 'Quit',
            cancelLabel: 'Keep running',
          },
        );
        if (!quit) return;
        await commands.killActiveAgentRuns().catch((err) => {
          console.warn('[close] killActiveAgentRuns failed:', err);
        });
      }

      const edits = sessionStore.allDirtyEdits();
      if (edits.length === 0) {
        // No drafts to flush. If we already prevented the close above for
        // the agent prompt, complete it now; otherwise let it proceed.
        if (event.isPreventDefault?.()) await win.destroy();
        return;
      }
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

// Best-effort liveness probe. On any failure assume nothing is running so
// a backend hiccup can never trap the user in the app.
async function agentsRunning(): Promise<boolean> {
  try {
    const res = await commands.hasActiveAgentRuns();
    return res.status === 'ok' && res.data === true;
  } catch (err) {
    console.warn('[close] hasActiveAgentRuns failed:', err);
    return false;
  }
}
