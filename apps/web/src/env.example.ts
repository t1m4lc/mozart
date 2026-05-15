/**
 * Local environment values. Copy this file to `env.ts` in the same
 * directory and replace the placeholder with your Clerk publishable
 * key — see `docs/setup-clerk.md` for the full setup walkthrough.
 *
 * `env.ts` is gitignored on purpose : every developer keeps their own
 * Clerk instance key locally. `env.example.ts` (this file) IS checked
 * in so newcomers know which shape to populate.
 *
 * The Clerk publishable key is **public** : it identifies your Clerk
 * instance to the SDK and is safe to ship in client code. The matching
 * **secret** key (used only on Clerk's backend / your server) must never
 * be checked in.
 */
export const env = {
  clerkPublishableKey: 'pk_test_PASTE_YOUR_PUBLISHABLE_KEY_HERE',
};
