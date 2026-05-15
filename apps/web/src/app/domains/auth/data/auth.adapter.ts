import { InjectionToken } from '@angular/core';
import type { OAuthProvider, User } from './auth.model';

// Auth-IO port for the apps/web side. Concrete impl is bound in
// `app.config.ts`. v0.0.1 uses `mockClerkAdapter` ; real `@clerk/angular`
// integration is a post-MVP slice that swaps the binding here.
//
// `signIn` returns the authenticated `User`. The OAuth dance is hidden
// from features ; in the mock it resolves after a fake delay, in the
// real impl it triggers Clerk's redirect flow and resolves on callback.
export interface AuthAdapter {
  signIn(provider: OAuthProvider): Promise<User>;
}

export const AUTH_ADAPTER = new InjectionToken<AuthAdapter>('AUTH_ADAPTER');
