// Public surface of `desktop-auth-util`. Pure helpers and domain
// model types — no Angular DI, no Tauri side effects. Lives at the
// bottom of the layer graph: data-access, ui, and feature all import
// from here.

export type {
  AuthSession,
  DeepLinkPayload,
  WelcomeState,
} from './lib/auth.model';
export { buildSignInUrl } from './lib/util-clerk-url';
export { decodeJwt, type JwtClaims } from './lib/util-decode-jwt';
export { parseDeepLink } from './lib/util-parse-deep-link';
