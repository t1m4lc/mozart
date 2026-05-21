// Shell-level layout dimensions. All values are CSS strings so they can
// flow straight into `[style.width]` / `[style.height]` bindings without
// runtime conversion. Centralizing them here keeps the right-aside
// constraint (panel ≈ square against the right-pane width, capped at
// 30vh) visibly tied to the right-pane width formula.

/** Left shell panel width — projects sidebar. */
export const SHELL_LEFT_PANEL_WIDTH = 'max(16rem, 20vw)';

/** Right shell panel width — files + workspace processes aside. */
export const SHELL_RIGHT_PANEL_WIDTH = 'max(20rem, 25vw)';

/** Workspace processes panel height — Setup / Run / Terminal body.
 *  Floor at 20rem, target 25vw so it reads roughly square against the
 *  right pane, hard-capped at 30vh so it never dominates the viewport
 *  vertically on tall windows. */
export const WORKSPACE_PROCESSES_PANEL_HEIGHT = 'min(max(20rem, 25vw), 30vh)';
