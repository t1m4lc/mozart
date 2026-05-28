import { InjectionToken } from '@angular/core';

// Origin of the apps/web Clerk surface — provided by `apps/desktop` from
// `environments/environment(.prod).ts` so dev and prod builds talk to
// the right host. Dev: `https://localhost:4201`. Prod: `https://app.mozart.build`.
//
// Consumed by:
// - libs/desktop-auth-data-access/auth.facade → buildSignInUrl(base, …)
// - apps/desktop/.../settings.page → derives the /account URL from the base
//
// The Rust side has its own dev/prod constants via `#[cfg(debug_assertions)]`
// (apps/desktop-tauri/src/github.rs, http_callback.rs) — they must stay in
// sync with the values provided here.
export const WEB_BASE_URL = new InjectionToken<string>('web.base.url');
