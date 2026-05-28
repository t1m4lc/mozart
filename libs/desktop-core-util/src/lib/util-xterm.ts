import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal, ITheme } from '@xterm/xterm';

// Read `--background` / `--foreground` off the body's computed style.
// The `.theme-mozart` class lives on <body>, so the CSS variables only
// resolve there; reading from <html> returns empty strings and falls
// back to white/black, which is the "terminal stays light in dark
// mode" bug. Domains that own a long-lived xterm pair this with a
// signal-driven effect that re-applies the theme on
// ThemeService.isDark() / activeTheme() change.
export function resolveXtermTheme(): ITheme {
  const source = document.body ?? document.documentElement;
  const styles = getComputedStyle(source);
  const bg = styles.getPropertyValue('--background').trim() || '0 0% 100%';
  const fg = styles.getPropertyValue('--foreground').trim() || '0 0% 0%';
  return {
    background: `hsl(${bg})`,
    foreground: `hsl(${fg})`,
    cursor: `hsl(${fg})`,
  };
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace';

export interface CreateXtermOptions {
  // `true` for read-only agent output (RunRegistry); `false` for an
  // interactive user shell (TerminalRegistry).
  readOnly: boolean;
  // Optional palette resolved from CSS variables. RunRegistry leaves it
  // unset (xterm picks its built-in defaults); TerminalRegistry passes
  // a palette derived from the active app theme.
  theme?: ITheme;
}

type XtermModule = typeof import('@xterm/xterm');
type FitAddonModule = typeof import('@xterm/addon-fit');

// Type-only imports above + dynamic-import below pull xterm.js (~290 kB)
// into its own chunk instead of joining the eager shell. Callers must
// `await loadXterm()` once before invoking `createXterm()` — registries
// do this through their own preload paths so their public APIs stay sync.
let cached: { xterm: XtermModule; fit: FitAddonModule } | null = null;
let inFlight: Promise<{ xterm: XtermModule; fit: FitAddonModule }> | null =
  null;

// `@xterm/xterm` and `@xterm/addon-fit` ship as UMD. esbuild in dev
// surfaces named exports synthetically; the Angular prod optimizer
// strips them, leaving only `default`. Normalize here so call sites
// can always reach `.Terminal` / `.FitAddon` without a guard.
function interop<T extends object>(mod: T): T {
  const m = mod as T & { default?: T };
  return m.default ?? m;
}

export function loadXterm(): Promise<{
  xterm: XtermModule;
  fit: FitAddonModule;
}> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]).then(([xterm, fit]) => {
    cached = { xterm: interop(xterm), fit: interop(fit) };
    inFlight = null;
    return cached;
  });
  return inFlight;
}

// Shared xterm.js Terminal construction for the `runs` and `terminals`
// domains. Defaults (cols, rows, font, scrollback, fit addon) are
// identical between read-only run output and interactive user shells;
// only `cursorBlink` / `disableStdin` (driven by `readOnly`) and the
// optional palette differ. Domain-specific wiring (onData, onResize,
// status signals, theme reactivity) stays in the caller.
//
// Synchronous on purpose so RunRegistry.ensureEntry — called from
// computed signals — does not have to become async. The route guard
// on the workspace-detail page awaits loadXterm() before mounting,
// so by the time any computed reads ensureEntry() the cache is warm.
export function createXterm(options: CreateXtermOptions): {
  term: Terminal;
  fit: FitAddon;
} {
  if (!cached) {
    throw new Error(
      'createXterm() called before loadXterm() resolved. Did the route guard run?',
    );
  }
  const term = new cached.xterm.Terminal({
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cursorBlink: !options.readOnly,
    disableStdin: options.readOnly,
    convertEol: true,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    scrollback: 5000,
    allowProposedApi: true,
    theme: options.theme,
  });
  const fit = new cached.fit.FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}
