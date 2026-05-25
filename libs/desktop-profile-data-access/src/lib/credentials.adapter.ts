import { InjectionToken } from '@angular/core';
import type { ProbeResult } from '@mozart/desktop-profile-util';

// Tauri-backed credentials port. Concrete impl is bound in app.config.ts
// (wraps has_anthropic_key / connect_anthropic / disconnect_anthropic /
// refresh_anthropic_connection from core/_bindings). No file under
// `domains/profile/` may import from `@tauri-apps/*` or `core/_bindings`
// directly — adapter discipline (Convention #2).
export interface CredentialsAdapter {
  // Cheap presence check on the OS keyring. Never returns the key.
  hasStoredKey(): Promise<boolean>;
  // Heuristic probe for a `claude /login` session on this machine.
  // Returns true if Claude Code's credential file is present in the
  // user's home dir; false otherwise (including the macOS Keychain-only
  // case, a known v0.1.0-beta.1 limitation).
  hasClaudeCodeSession(): Promise<boolean>;
  // Probe `key` against Anthropic; on `connected` the backend persists it
  // to the OS keyring before resolving. On `invalid` / `network_error` the
  // key never touches disk.
  connect(key: string): Promise<ProbeResult>;
  // Idempotent removal of the stored key.
  clear(): Promise<void>;
  // Re-probe the currently stored key. Caller must guarantee a key is
  // stored (use `hasStoredKey` to gate).
  refresh(): Promise<ProbeResult>;

  /** Cheap presence check on the OS keyring. Never returns the token. */
  hasGithubToken(): Promise<boolean>;
  /** Probe + store a personal-access token. On 'unauthorized' /
   *  'network_error' the token is NOT persisted. Returns the resolved
   *  login on success. */
  connectGithub(token: string): Promise<GithubProbe>;
  /** Use the user's current Clerk session JWT to fetch a fresh GitHub
   *  OAuth token from the apps/web Pages Function, validate it via
   *  `GET /user`, and store it in the keyring marked `oauth_clerk`. */
  connectGithubViaClerk(): Promise<GithubProbe>;
  /** Provenance of the currently-stored token: `'pat'` if connected via
   *  personal access token, `'oauth_clerk'` if via Clerk-mediated OAuth,
   *  `null` if not connected. */
  getGithubTokenKind(): Promise<GithubTokenKind | null>;
  /** List GitHub repos visible to the Clerk-linked GitHub account. The
   *  desktop talks to the apps/web Pages Function, which uses the Clerk
   *  Backend SDK to mint a fresh GitHub OAuth token. */
  listClerkGithubRepos(): Promise<GithubRepo[]>;
  /** Idempotent removal of the stored token. */
  disconnectGithub(): Promise<void>;
}

export type GithubProbe =
  | { kind: 'ok'; login: string }
  | { kind: 'unauthorized' }
  | { kind: 'network_error'; message: string };

export type GithubTokenKind = 'pat' | 'oauth_clerk';

export interface GithubRepo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly htmlUrl: string;
  readonly cloneUrl: string;
  readonly private: boolean;
  readonly defaultBranch: string | null;
  readonly description: string | null;
  readonly updatedAt: string | null;
}

export const CREDENTIALS_ADAPTER = new InjectionToken<CredentialsAdapter>(
  'CREDENTIALS_ADAPTER',
);
