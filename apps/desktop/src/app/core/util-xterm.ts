import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';

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

// Shared xterm.js Terminal construction for the `runs` and `terminals`
// domains. Defaults (cols, rows, font, scrollback, fit addon) are
// identical between read-only run output and interactive user shells;
// only `cursorBlink` / `disableStdin` (driven by `readOnly`) and the
// optional palette differ. Domain-specific wiring (onData, onResize,
// status signals, theme reactivity) stays in the caller.
export function createXterm(options: CreateXtermOptions): {
  term: Terminal;
  fit: FitAddon;
} {
  const term = new Terminal({
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
  const fit = new FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}
