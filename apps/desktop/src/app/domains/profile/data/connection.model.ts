// Connection models for the Anthropic (Claude) provider. v0.0.1 has a
// single provider; v0.1.0 will fan out to OpenAI / OpenRouter / Local.

export type ConnectionProvider = 'claude';

// Drives the connection card's pill + button row. See ui-connection-card
// for the full status→pill→action mapping.
//   unknown                    — pre-init; we have not consulted the keyring yet
//   not_connected              — no key stored AND no `claude /login` session detected
//   checking                   — a probe is in flight
//   connected                  — last probe returned 200 OK (Mozart-stored API key)
//   connected_via_claude_code  — a `claude /login` session was detected (Pro/Max path)
//   invalid                    — last probe returned 401 / 403
//   network_error              — last probe could not reach the API
export type ConnectionStatus =
  | 'unknown'
  | 'not_connected'
  | 'checking'
  | 'connected'
  | 'connected_via_claude_code'
  | 'invalid'
  | 'network_error';

// The three discriminated outcomes the Tauri probe returns. Wire shape
// per tauri-specta: `{ kind: 'connected' | 'invalid' | 'network_error' }`.
// The adapter collapses the tagged form to this bare union.
export type ProbeResult = 'connected' | 'invalid' | 'network_error';

export interface Connection {
  provider: ConnectionProvider;
  status: ConnectionStatus;
  lastCheckedAt: Date | null;
}
