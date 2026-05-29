import type { GithubRemoteStatus } from '@mozart/desktop-projects-data-access';

// Pure pre-flight decision for the "Create PR" click. Live gates in,
// one actionable next step out — so the click handler only performs IO
// (open a dialog / toast / create the PR). Kept free of Angular and IO
// so the gate priority is unit-testable in isolation.
//
//   !connected           ──> connect         (open the GitHub connect dialog)
//   remote != github     ──> blocked-remote  (toast the reason)
//   uncommitted changes  ──> commit          (open the commit-&-PR dialog)
//   otherwise            ──> create          (push + open the PR directly)
export type PrFlowDecision =
  | { readonly kind: 'connect' }
  | { readonly kind: 'blocked-remote'; readonly message: string }
  | { readonly kind: 'no-changes' }
  | { readonly kind: 'commit'; readonly paths: readonly string[] }
  | { readonly kind: 'create' };

export interface PrFlowGates {
  readonly connected: boolean;
  readonly remote: GithubRemoteStatus | null;
  readonly changedPaths: readonly string[];
  /** True when the branch has any changes vs base (committed or uncommitted). */
  readonly hasBranchChanges: boolean;
}

export function decidePrAction(gates: PrFlowGates): PrFlowDecision {
  if (!gates.connected) return { kind: 'connect' };
  if (gates.remote?.kind !== 'github') {
    return { kind: 'blocked-remote', message: remoteBlockMessage(gates.remote) };
  }
  if (!gates.hasBranchChanges) {
    return { kind: 'no-changes' };
  }
  if (gates.changedPaths.length > 0) {
    return { kind: 'commit', paths: gates.changedPaths };
  }
  return { kind: 'create' };
}

function remoteBlockMessage(remote: GithubRemoteStatus | null): string {
  switch (remote?.kind) {
    case 'no-remote':
      return 'The source repository has no Git remote configured. Add a GitHub remote to open a pull request.';
    case 'non-github':
      return `PR creation currently requires a GitHub remote. This project's remote is ${remote.url}.`;
    case 'error':
      return `Couldn't read this project's Git remotes: ${remote.message}`;
    default:
      return "Couldn't determine the project's Git remote. Try again in a moment.";
  }
}
