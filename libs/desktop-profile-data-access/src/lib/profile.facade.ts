import {
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type {
  Connection,
  ConnectionProvider,
  ConnectionStatus,
  ProbeResult,
} from '@mozart/desktop-profile-util';
import type { AgentProviderId } from '@mozart/desktop-llm-model-util';
import { AuthFacade } from '@mozart/desktop-auth-data-access';
import { DesktopAnalyticsFacade } from '@mozart/desktop-core-data-access';
import { ANALYTICS_EVENTS } from '@mozart/shared-util-analytics';
import {
  CREDENTIALS_ADAPTER,
  type GithubProbe,
  type GithubTokenKind,
} from './credentials.adapter';
import { ProfileStore } from './profile.store';

// Public API of the `profile` domain. Features inject this — never the
// store or the adapter directly.
@Injectable({ providedIn: 'root' })
export class ProfileFacade {
  private readonly store = inject(ProfileStore);
  private readonly credentials = inject(CREDENTIALS_ADAPTER);
  private readonly auth = inject(AuthFacade);
  private readonly analytics = inject(DesktopAnalyticsFacade);

  constructor() {
    // BANNER: if you do NOT see this line in DevTools console at app
    // boot, the Angular bundle is stale — hard-reload the webview.
    console.info('[profile] facade v3 (auto-connect effect) constructed');
    // Re-evaluate GitHub state when a session arrives mid-app.
    effect(() => {
      const session = this.auth.session();
      console.info(
        '[profile] session effect: hasSession=',
        session !== null,
        ' state=',
        this._githubState(),
      );
      if (session) {
        void this.initializeGithub();
      }
    });
  }

  readonly status = this.store.status;
  readonly lastCheckedAt = this.store.lastCheckedAt;
  readonly connection = computed<Connection>(() => ({
    provider: 'claude',
    status: this.store.status(),
    lastCheckedAt: this.store.lastCheckedAt(),
  }));

  // ── Codex (OpenAI) connection ────────────────────────────────────────
  // Held as facade-local signals (mirrors the GitHub state pattern) rather
  // than a second store track — the Claude store is single-provider.
  private readonly _codexStatus = signal<ConnectionStatus>('unknown');
  readonly codexStatus = computed(() => this._codexStatus());
  readonly codexConnection = computed<Connection>(() => ({
    provider: 'codex',
    status: this._codexStatus(),
    lastCheckedAt: null,
  }));

  private static readonly claudeReady = (s: ConnectionStatus): boolean =>
    s === 'connected' || s === 'connected_via_claude_code';
  private static readonly codexReady = (s: ConnectionStatus): boolean =>
    s === 'connected' || s === 'connected_via_codex';

  /** Which agent backend a run should target. Prefers Claude when both are
   *  connected (preserves prior behavior); a Codex-only tester routes to
   *  Codex; with neither connected it falls back to `claude_cli` and the
   *  composer surfaces the connect-CTA before a run ever starts. */
  readonly activeAgentProvider = computed<AgentProviderId>(() => {
    if (ProfileFacade.claudeReady(this.status())) return 'claude_cli';
    if (ProfileFacade.codexReady(this._codexStatus())) return 'codex';
    return 'claude_cli';
  });

  /** True once at least one agent provider is connected. Drives the
   *  composer's "connect a provider" gate. */
  readonly hasAnyProvider = computed(
    () =>
      ProfileFacade.claudeReady(this.status()) ||
      ProfileFacade.codexReady(this._codexStatus()),
  );

  /** Data-driven status read: returns the connection-status signal for a
   *  provider track. Lets onboarding/settings cards iterate a registry
   *  without branching per provider. */
  connectionFor(provider: ConnectionProvider): Signal<ConnectionStatus> {
    return provider === 'codex' ? this.codexStatus : this.status;
  }

  /** Full `Connection` object signal for a provider track (for the Settings
   *  connection card, which renders the whole connection). */
  connectionInfoFor(provider: ConnectionProvider): Signal<Connection> {
    return provider === 'codex' ? this.codexConnection : this.connection;
  }

  /** Idempotent boot probe for a provider track. */
  initializeFor(provider: ConnectionProvider): Promise<void> {
    return provider === 'codex' ? this.initializeCodex() : this.initialize();
  }

  /** Connect-button flow for a provider track. Normalizes the per-provider
   *  outcomes to `'session' | 'needs_api_key'`. */
  async tryConnectFor(
    provider: ConnectionProvider,
  ): Promise<'session' | 'needs_api_key'> {
    if (provider === 'codex') {
      return (await this.tryConnectCodex()) === 'codex_session'
        ? 'session'
        : 'needs_api_key';
    }
    return (await this.tryConnect()) === 'claude_code'
      ? 'session'
      : 'needs_api_key';
  }

  /** Re-probe the stored key for a provider track (the card's "Test"). */
  testConnectionFor(provider: ConnectionProvider): Promise<void> {
    return provider === 'codex'
      ? this.testCodexConnection()
      : this.testConnection();
  }

  /** Clear stored credentials for a provider track. */
  disconnectFor(provider: ConnectionProvider): Promise<void> {
    return provider === 'codex' ? this.disconnectCodex() : this.disconnect();
  }

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
    this.store.setChecking();
    if (await this.credentials.hasClaudeCodeSession()) {
      this.store.setStatus('connected_via_claude_code');
      return 'claude_code';
    }
    this.store.setStatus('not_connected');
    return 'needs_api_key';
  }

  // Dialog calls this; returns the result so the dialog can branch on it
  // to render either an error or close itself.
  async connectWithKey(key: string): Promise<ProbeResult> {
    this.store.setChecking();
    const result = await this.credentials.connect(key);
    this.store.setStatus(result, new Date());
    if (result === 'connected') {
      this.analytics.track(ANALYTICS_EVENTS.providerConnected, {
        provider: 'claude',
      });
    }
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

  // ── Codex connect flows — parallel the Claude ones above ─────────────

  /** Idempotent first-load probe for Codex. Stored OpenAI key → re-probe;
   *  else a `codex login` session → connected_via_codex; else not_connected. */
  async initializeCodex(): Promise<void> {
    if (this._codexStatus() !== 'unknown') return;
    this._codexStatus.set('checking');
    if (await this.credentials.hasOpenaiKey()) {
      this._codexStatus.set(await this.credentials.refreshOpenai());
      return;
    }
    if (await this.credentials.hasCodexSession()) {
      this._codexStatus.set('connected_via_codex');
      return;
    }
    this._codexStatus.set('not_connected');
  }

  /** Connect-button flow for Codex. Re-checks for a `codex login` session
   *  first; returns 'needs_api_key' when none is found so the caller can
   *  open the OPENAI_API_KEY dialog. */
  async tryConnectCodex(): Promise<'codex_session' | 'needs_api_key'> {
    this._codexStatus.set('checking');
    if (await this.credentials.hasCodexSession()) {
      this._codexStatus.set('connected_via_codex');
      return 'codex_session';
    }
    this._codexStatus.set('not_connected');
    return 'needs_api_key';
  }

  /** Dialog calls this; persists on `connected` and returns the result. */
  async connectCodexWithKey(key: string): Promise<ProbeResult> {
    this._codexStatus.set('checking');
    const result = await this.credentials.connectOpenai(key);
    this._codexStatus.set(result);
    if (result === 'connected') {
      this.analytics.track(ANALYTICS_EVENTS.providerConnected, {
        provider: 'codex',
      });
    }
    return result;
  }

  /** Manual re-probe of the stored OpenAI key (the Codex card's "Test
   *  connection"). Mirrors {@link testConnection}. */
  async testCodexConnection(): Promise<void> {
    this._codexStatus.set('checking');
    this._codexStatus.set(await this.credentials.refreshOpenai());
  }

  /** Clears the stored OpenAI key, falling back to a `codex login` session
   *  if one is still present. */
  async disconnectCodex(): Promise<void> {
    await this.credentials.clearOpenai();
    if (await this.credentials.hasCodexSession()) {
      this._codexStatus.set('connected_via_codex');
      return;
    }
    this._codexStatus.set('not_connected');
  }

  // Minimal state: 'unknown' before the boot probe resolves, 'none' if
  // no token stored, 'connected' once a token is verified. The login
  // is held alongside for display in the settings card.

  private readonly _githubState = signal<'unknown' | 'none' | 'connected'>(
    'unknown',
  );
  private readonly _githubLogin = signal<string | null>(null);
  private readonly _githubKind = signal<GithubTokenKind | null>(null);
  readonly githubState = computed(() => this._githubState());
  readonly githubLogin = computed(() => this._githubLogin());
  readonly githubKind = computed(() => this._githubKind());
  readonly githubConnected = computed(
    () => this._githubState() === 'connected',
  );

  /** Idempotent boot probe. Three branches:
   *  1. Token already in keyring → hydrate state + provenance.
   *  2. No token, but the Clerk JWT carries a `github_username` claim
   *     (= user signed in via the GitHub social connection) → silently
   *     attempt `connectGithubViaClerk` so the PR dialog shows up
   *     pre-connected. Failures are swallowed; the user can still
   *     click the inline Connect button.
   *  3. No token and no GitHub link → leave state as `'none'`. */
  async initializeGithub(): Promise<void> {
    console.info(
      '[profile] initializeGithub() called, current state =',
      this._githubState(),
    );
    // Don't no-op on 'none' — the effect that watches auth.session()
    // can call us again after a fresh sign-in, and we want that path
    // to re-evaluate (the github_username claim isn't available pre
    // sign-in). Only 'connected' is a definitive answer.
    if (this._githubState() === 'connected') return;
    try {
      const present = await this.credentials.hasGithubToken();
      if (present) {
        this._githubKind.set(await this.credentials.getGithubTokenKind());
        this._githubState.set('connected');
        console.info(
          '[profile] github init: token in keyring →',
          this._githubKind(),
        );
        return;
      }
      // No keyring token. The backend is the source of truth for
      // "does this user have GitHub linked via Clerk?" — so we attempt
      // the auto-connect whenever a Clerk session exists, regardless of
      // whether the JWT carries our custom `github_username` claim
      // (the default Clerk session JWT doesn't, and not every install
      // configures the `mozart` template). If the user actually isn't
      // linked, the backend returns `not_linked` and we fall through
      // to state 'none' — the manual Connect button takes over.
      const hasSession = this.auth.session() !== null;
      console.info('[profile] github init: hasSession=', hasSession);
      if (hasSession) {
        console.info('[profile] calling connectGithubViaClerk()…');
        try {
          const result = await this.connectGithubViaClerk();
          console.info(
            '[profile] auto-connect result:',
            result.kind,
            result.kind === 'ok' ? `(login=${result.login})` : '',
            result.kind === 'network_error' ? `msg=${result.message}` : '',
          );
        } catch (err) {
          console.info(
            '[profile] auto-connect rejected (likely not_linked):',
            err,
          );
        }
      }
      // Stay 'unknown' until a session exists — that way the effect
      // above can re-trigger us once sign-in completes. Once a session
      // is present and we still don't have a token, lock state to
      // 'none'.
      if (this._githubState() === 'unknown' && hasSession) {
        this._githubState.set('none');
      }
    } catch (err) {
      console.warn('[profile] github init failed:', err);
      this._githubState.set('none');
      this._githubKind.set(null);
    }
  }

  async connectGithub(token: string): Promise<GithubProbe> {
    const result = await this.credentials.connectGithub(token);
    if (result.kind === 'ok') {
      this._githubLogin.set(result.login);
      this._githubKind.set('pat');
      this._githubState.set('connected');
      this.analytics.track(ANALYTICS_EVENTS.providerConnected, {
        provider: 'github',
      });
    }
    return result;
  }

  /** Primary "Connect with GitHub" path. Reuses the user's existing Clerk
   *  session: the desktop hands its session JWT to the apps/web Pages
   *  Function, which calls Clerk's Backend SDK to retrieve the
   *  GitHub OAuth token and returns it for storage in the keyring. */
  async connectGithubViaClerk(): Promise<GithubProbe> {
    const result = await this.credentials.connectGithubViaClerk();
    if (result.kind === 'ok') {
      this._githubLogin.set(result.login);
      this._githubKind.set('oauth_clerk');
      this._githubState.set('connected');
      this.analytics.track(ANALYTICS_EVENTS.providerConnected, {
        provider: 'github',
      });
    }
    return result;
  }

  async disconnectGithub(): Promise<void> {
    await this.credentials.disconnectGithub();
    this._githubLogin.set(null);
    this._githubKind.set(null);
    this._githubState.set('none');
  }
}
