import { Injectable, computed, inject, signal } from '@angular/core';
import type { Connection, ProbeResult } from './connection.model';
import { CREDENTIALS_ADAPTER, type GithubProbe } from './credentials.adapter';
import { ProfileStore } from './profile.store';

// Public API of the `profile` domain. Features inject this — never the
// store or the adapter directly.
@Injectable({ providedIn: 'root' })
export class ProfileFacade {
  private readonly store = inject(ProfileStore);
  private readonly credentials = inject(CREDENTIALS_ADAPTER);

  readonly status = this.store.status;
  readonly lastCheckedAt = this.store.lastCheckedAt;
  readonly connection = computed<Connection>(() => ({
    provider: 'claude',
    status: this.store.status(),
    lastCheckedAt: this.store.lastCheckedAt(),
  }));

  // Idempotent first-load probe. Three branches:
  //   1. Mozart has a stored API key  → re-probe Anthropic for the
  //      `connected | invalid | network_error` outcome.
  //   2. Else, a `claude /login` session is detected on this machine
  //      → set `connected_via_claude_code` (Pro/Max path).
  //   3. Else → `not_connected`.
  // Re-calls while already initialized are no-ops; use `testConnection`
  // to force a re-probe.
  async initialize(): Promise<void> {
    if (this.store.status() !== 'unknown') return;
    this.store.setChecking();
    if (await this.credentials.hasStoredKey()) {
      const result = await this.credentials.refresh();
      this.store.setStatus(result, new Date());
      return;
    }
    if (await this.credentials.hasClaudeCodeSession()) {
      this.store.setStatus('connected_via_claude_code');
      return;
    }
    this.store.setStatus('not_connected');
  }

  // Connect-button flow. Re-checks for a `claude /login` session first —
  // a Pro/Max user who logged in between app start and clicking Connect
  // gets a single-click experience here. Returns 'needs_api_key' when no
  // session is found so the caller can open the API-key dialog.
  async tryConnect(): Promise<'claude_code' | 'needs_api_key'> {
    if (await this.credentials.hasClaudeCodeSession()) {
      this.store.setStatus('connected_via_claude_code');
      return 'claude_code';
    }
    return 'needs_api_key';
  }

  // Dialog calls this; returns the result so the dialog can branch on it
  // to render either an error or close itself.
  async connectWithKey(key: string): Promise<ProbeResult> {
    this.store.setChecking();
    const result = await this.credentials.connect(key);
    this.store.setStatus(result, new Date());
    return result;
  }

  // Manual re-probe of the stored key. Used by the "Test connection" and
  // "Retry" affordances on the card.
  async testConnection(): Promise<void> {
    this.store.setChecking();
    const result = await this.credentials.refresh();
    this.store.setStatus(result, new Date());
  }

  // Clears the stored key. If a `claude /login` session is still on the
  // machine, the card falls through to that state; otherwise it lands on
  // `not_connected`. The confirm modal calls this from its onConfirm.
  async disconnect(): Promise<void> {
    await this.credentials.clear();
    if (await this.credentials.hasClaudeCodeSession()) {
      this.store.setStatus('connected_via_claude_code');
      return;
    }
    this.store.setStatus('not_connected');
  }

  // ---------- GitHub (Phase 4f) ----------
  // Minimal state: 'unknown' before the boot probe resolves, 'none' if
  // no token stored, 'connected' once a token is verified. The login
  // is held alongside for display in the settings card.

  private readonly _githubState = signal<'unknown' | 'none' | 'connected'>(
    'unknown',
  );
  private readonly _githubLogin = signal<string | null>(null);
  readonly githubState = computed(() => this._githubState());
  readonly githubLogin = computed(() => this._githubLogin());
  readonly githubConnected = computed(() => this._githubState() === 'connected');

  /** Idempotent boot probe: if a token is stored, mark connected. We
   *  don't re-validate against the GitHub API here — the user's first
   *  push or PR creation will surface a stale-token error inline. */
  async initializeGithub(): Promise<void> {
    if (this._githubState() !== 'unknown') return;
    try {
      const present = await this.credentials.hasGithubToken();
      this._githubState.set(present ? 'connected' : 'none');
    } catch (err) {
      console.warn('[profile] github init failed:', err);
      this._githubState.set('none');
    }
  }

  async connectGithub(token: string): Promise<GithubProbe> {
    const result = await this.credentials.connectGithub(token);
    if (result.kind === 'ok') {
      this._githubLogin.set(result.login);
      this._githubState.set('connected');
    }
    return result;
  }

  async disconnectGithub(): Promise<void> {
    await this.credentials.disconnectGithub();
    this._githubLogin.set(null);
    this._githubState.set('none');
  }
}
