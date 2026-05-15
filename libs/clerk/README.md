# @mozart/clerk

Signal-based Angular wrapper around [`@clerk/clerk-js`](https://www.npmjs.com/package/@clerk/clerk-js).

Clerk does not ship a first-party Angular SDK (only React, Next.js,
Remix, Astro, Vue, JS). This library bridges the gap : it loads the
vanilla `Clerk` instance once during bootstrap, mirrors its mutable
state into Angular signals, and exposes a small typed action surface.

## Setup

```ts
// apps/web/src/app/app.config.ts
import { provideClerk } from '@mozart/clerk';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClerk({ publishableKey: 'pk_test_XXXXX' }),
    // …
  ],
};
```

`provideClerk` registers an `appInitializer` that awaits
`ClerkService.load()`. By the time any component injects the service,
the Clerk instance is loaded and `isLoaded()` is `true`.

## Use

```ts
import { Component, computed, inject } from '@angular/core';
import { ClerkService } from '@mozart/clerk';

@Component({ /* … */ })
export class LoginPage {
  private readonly clerk = inject(ClerkService);

  readonly isSignedIn = this.clerk.isSignedIn; // Signal<boolean>
  readonly user = this.clerk.user;             // Signal<UserResource | null>

  protected onGithub() {
    return this.clerk.signInWithOAuth('oauth_github', {
      redirectUrl: '/auth-callback',
      redirectUrlComplete: '/dashboard',
    });
  }

  protected async getMozartToken(): Promise<string | null> {
    return this.clerk.getToken({ template: 'mozart' });
  }
}
```

## Public surface

```ts
provideClerk(config: ClerkConfig): EnvironmentProviders;

interface ClerkConfig {
  readonly publishableKey: string;
  readonly options?: ClerkOptions;
}

class ClerkService {
  readonly isLoaded: Signal<boolean>;
  readonly user: Signal<UserResource | null>;
  readonly session: Signal<SessionResource | null>;
  readonly isSignedIn: Signal<boolean>;

  load(): Promise<void>;
  signInWithOAuth(
    strategy: OAuthStrategy,
    redirect: { redirectUrl: string; redirectUrlComplete: string },
  ): Promise<void>;
  signOut(redirectUrl?: string): Promise<void>;
  getToken(opts?: { template?: string }): Promise<string | null>;
  reload(): Promise<void>;
}
```

## Design notes

- **Lazy import** : `@clerk/clerk-js` is dynamically imported inside
  `load()` so the SDK ships in its own chunk. The main bundle stays
  small until the user actually navigates to an auth surface.
- **Reactive state** : the service subscribes to Clerk's `addListener`
  and mirrors `user` + `session` into signals. Consumers compute
  derived state via `computed()` — no manual subscription bookkeeping.
- **Zone-agnostic** : signals trigger Angular change detection
  regardless of the zone the callback fires in, so the listener does
  not need `NgZone.run()` gymnastics.
- **Idempotent load** : calling `load()` twice is a no-op ; the first
  call's promise is cached and returned to subsequent callers.

## Inspiration

API shape inspired by [`ngx-clerk`](https://github.com/anagstef/ngx-clerk)
(MIT). Mozart implements its own thin wrapper because the SDK surface
this app actually uses is small enough to keep maintained in-tree.
