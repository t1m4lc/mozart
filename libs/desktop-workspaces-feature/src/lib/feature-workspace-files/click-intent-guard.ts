// Browsers fire click → click → dblclick for a double-click gesture.
// Single-click now REUSES the active file tab (replaces its path), which
// is destructive — so it must not run as the leading click of a
// double-click. This guard defers the single-click action and lets a
// following double-click cancel it. `dispose` clears any pending timer
// on component teardown.
//
// Delay tuned to catch typical double-clicks (<250ms apart). A slower
// double-click degrades gracefully to "open + pin the same file",
// never a stray second tab.
const DEFAULT_DELAY_MS = 250;

export interface ClickIntentGuard {
  single(run: () => void): void;
  double(run: () => void): void;
  dispose(): void;
}

export function createClickIntentGuard(
  delayMs = DEFAULT_DELAY_MS,
): ClickIntentGuard {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    single(run: () => void): void {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    double(run: () => void): void {
      cancel();
      run();
    },
    dispose: cancel,
  };
}
