// Dev defaults — swapped at production build by Angular's fileReplacements
// (see apps/desktop/project.json → build.configurations.production).
//
// webBaseUrl is the origin of apps/web (the cloud companion). The desktop
// opens `${webBaseUrl}/login?…` for Clerk sign-in and `${webBaseUrl}/account`
// for the user's account page. Dev points at the local Vite dev server,
// prod at app.mozart.build. The Rust side has matching constants in
// apps/desktop-tauri/src/{github.rs,auth/http_callback.rs} — keep in sync.
export const environment = {
  webBaseUrl: 'https://localhost:4201',
  // Empty key in dev → analytics stays silent (no events sent locally).
  posthogKey: '',
  posthogHost: 'https://t.mozart.build',
};
