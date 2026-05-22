// Public surface of `desktop-terminals-data-access`. Facade + adapter
// port + per-workspace xterm registry. The Tauri impl is wired in
// core/tauri-adapters.ts. FeatureWorkspaceTerminal stays in
// apps/desktop/src/app/domains/terminals/ until workspaces is libbed
// (it injects WorkspacesFacade).
export { TerminalsFacade } from './lib/terminals.facade';
export {
  TERMINALS_ADAPTER,
  type TerminalsAdapter,
} from './lib/terminals.adapter';
export {
  TerminalRegistry,
  type TerminalEntry,
} from './lib/terminal-registry.service';
