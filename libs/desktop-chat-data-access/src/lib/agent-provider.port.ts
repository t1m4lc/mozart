import type { AgentProviderId } from '@mozart/desktop-llm-model-util';

// Minimal provider-connection surface the chat domain needs to pick which
// agent backend runs a turn. Lets the chat lib stay independent from the
// profile domain — the desktop app binds `ProfileFacade` to this token via
// `useExisting` in app.config. The method names match `ProfileFacade`'s
// computed signals (which are callable) so the binding is structural.
export abstract class AgentProviderPort {
  /** The agent backend to run, resolved from the connected provider. */
  abstract activeAgentProvider(): AgentProviderId;
  /** True once at least one provider is connected; false drives the
   *  composer's connect-CTA. */
  abstract hasAnyProvider(): boolean;
}
