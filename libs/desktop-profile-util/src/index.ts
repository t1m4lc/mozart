// Public surface of `desktop-profile-util`. Domain model types only.
// Pure TypeScript — no Angular DI, no signal store.

export type { Profile } from './lib/profile.model';
export type {
  Connection,
  ConnectionProvider,
  ConnectionStatus,
  ProbeResult,
} from './lib/connection.model';
