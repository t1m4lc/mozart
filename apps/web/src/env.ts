/**
 * Local environment values. Replace placeholders with your own values
 * — see `docs/setup-clerk.md` for the full setup walkthrough.
 *
 * The Clerk publishable key is **public** : it identifies your Clerk
 * instance to the SDK and is safe to ship in client code. The matching
 * **secret** key (used only on Clerk's backend / your server) must never
 * be checked in.
 *
 * For production deployments, override via `environments/environment.production.ts`
 * + Angular build file replacements ; the placeholder below is only the
 * dev-time fallback.
 */
export const env = {
  clerkPublishableKey: 'pk_test_PASTE_YOUR_PUBLISHABLE_KEY_HERE',
};
