import type { AuthSession } from './auth.model';

// Wire shape for the persisted auth session. Stored as a JSON-encoded
// byte string in the Stronghold key-value store. The domain model
// uses `Date` for `expiresAt` ; the wire uses an epoch-ms number for
// stable JSON serialization.
//
// Mappers are plain named functions (no classes) per the project's
// adapter discipline.
export interface AuthSessionDto {
  readonly token: string;
  readonly expiresAt: number;
}

export function sessionFromDto(dto: AuthSessionDto): AuthSession {
  return {
    token: dto.token,
    expiresAt: new Date(dto.expiresAt),
  };
}

export function sessionToDto(session: AuthSession): AuthSessionDto {
  return {
    token: session.token,
    expiresAt: session.expiresAt.getTime(),
  };
}
