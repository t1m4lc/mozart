// Wire shape pushed by the Rust `terminal::spawn` reader thread to the
// front end. Mirrors `TerminalEvent` in `_bindings.ts`.

export type TerminalEvent =
  | { kind: 'output'; data: string }
  | { kind: 'exited'; code: number };
