// Public surface of the `terminals` domain. The TerminalRegistry +
// adapter token are exposed so app.config.ts can bind a Tauri impl;
// the registry itself is `providedIn: 'root'` and reachable via DI.

export type { TerminalEvent } from './data/terminal-event.model';
export { TerminalsFacade } from './data/terminals.facade';
export {
  TERMINALS_ADAPTER,
  type TerminalsAdapter,
} from './data/terminals.adapter';
export { TerminalRegistry } from './data/terminal-registry.service';
export { FeatureWorkspaceTerminal } from './feature-workspace-terminal/feature-workspace-terminal';
