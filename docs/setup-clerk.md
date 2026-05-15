# Setting up Clerk for Mozart

Mozart's apps/web surface authenticates users through [Clerk](https://clerk.com).
This document walks through the one-time Clerk-side configuration you
need so the sign-in flow works end-to-end in development.

> **Scope** : everything you need for local development (sign in via
> Google or GitHub, hand off a JWT to the desktop). Production hosting
> (custom domain, environment-specific keys) is out of scope here —
> the steps below cover Clerk's development instance, which is enough
> to run `pnpm nx serve web` against a real Clerk OAuth round-trip.

## 1. Create a Clerk application

1. Sign up at <https://clerk.com> (free tier is plenty for development).
2. From the dashboard, click **Create application**.
3. Name it `Mozart` (or whatever you prefer ; the name shown to users
   on the OAuth provider consent screen lives elsewhere).
4. Under **Sign-in options**, enable :
   - **Google** (one-click — Clerk provides the OAuth app)
   - **GitHub** (one-click — Clerk provides the OAuth app)
5. Leave everything else at its default. Click **Create application**.

Clerk takes you to the **API keys** screen. Keep this tab open — you
will need the **publishable key** in step 4.

## 2. Configure the `mozart` JWT template

The desktop reads an `onboarding` claim out of the JWT to decide
whether to route the user into `/onboarding` or `/`. Clerk lets you
configure custom JWT templates that bake user metadata into the token.

1. In the Clerk dashboard, open **JWT Templates** (under "Configure").
2. Click **+ New template**.
3. Pick **Blank** as the starting point.
4. Set the **Name** to exactly `mozart` (lowercase, no spaces — the
   front-end calls `getToken({ template: 'mozart' })`).
5. Set the **Token lifetime** to `604800` (7 days). The desktop uses
   the JWT's `exp` claim to decide when to prompt for re-auth.
6. In the **Claims** editor, paste :

   ```json
   {
     "name": "{{user.full_name}}",
     "email": "{{user.primary_email_address}}",
     "github_username": "{{user.external_accounts.github.username}}",
     "onboarding": "{{user.unsafe_metadata.onboarding}}"
   }
   ```

7. **Save**.

> Clerk renders missing template variables as `null` rather than
> failing the token — the desktop's JWT decoder accepts missing
> fields and falls back to safe defaults (`onboarding ?? false`,
> empty name, etc.).

## 3. Allow apps/web's dev origin

By default Clerk only accepts traffic from the production-style URL
you configure under your application's instance. For local dev :

1. In the dashboard, open **Domains**.
2. Under **Development**, add `https://localhost:4201`.
3. Save.

The Mozart dev server runs apps/web at `https://localhost:4201`
(see `apps/web/project.json` — `ssl: true`). The first browser visit
prompts you to accept the Angular self-signed cert — that's expected,
accept it once and Clerk's redirects will work for the rest of the
session.

## 4. Wire the publishable key

1. Copy the **Publishable key** from the Clerk dashboard's **API keys**
   screen — it starts with `pk_test_…` for development instances.
2. Open `apps/web/src/env.ts`.
3. Replace the placeholder :

   ```ts
   export const env = {
     clerkPublishableKey: 'pk_test_PASTE_YOUR_PUBLISHABLE_KEY_HERE',
   };
   ```

   with your actual key :

   ```ts
   export const env = {
     clerkPublishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   };
   ```

> The publishable key is **public** — it's safe to ship in client
> code and check in to source control. Only the matching **secret
> key** (which Mozart never uses, since it has no server-side auth
> path) must be kept private.

## 5. Run it

```bash
# In one terminal :
pnpm nx tauri dev desktop

# In another :
pnpm nx serve web
```

1. The Mozart desktop window opens on `/welcome`. Click **Sign in**.
2. Your default browser opens `https://localhost:4201/login?state=…&port=…`.
3. Click **Sign in with GitHub** (or Google). Clerk handles the OAuth
   redirect, the user authorizes, and the browser returns to
   `/auth-callback`.
4. Once Clerk's session is resolved, you land on `/dashboard` with a
   "Launch Mozart desktop" button.
5. Click **Launch** — apps/web `fetch()`-es the localhost HTTP
   callback, the desktop receives the token, validates the state
   nonce, persists the session in the OS keyring, and navigates
   inside the app.

If something fails, the apps/web `/dashboard` surfaces a
"Mozart isn't responding" state with a Retry button. Common causes :

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Clerk not loaded" | Publishable key still has the placeholder string | Paste the real key into `apps/web/src/env.ts` |
| OAuth redirect lands on an error page | `https://localhost:4201` not added to Clerk's allowed domains | Step 3 above |
| Desktop console says "state mismatch" | The browser tab has a stale `port` in `localStorage` from a previous desktop boot | Click **Sign in** on the desktop again — a fresh URL replaces the stale values |
| `getToken({ template: 'mozart' })` returns null | JWT template named `mozart` doesn't exist | Step 2 above ; confirm the name is exactly `mozart`, lowercase |

## 6. Optional : link GitHub for repository operations

Step 4 of the onboarding wizard offers to connect a GitHub account so
Mozart can push branches and open Pull Requests on your behalf. For
v0.0.1 this still uses a **Personal Access Token** flow under the
hood ; the Clerk OAuth identity from sign-in is read-only and does
not include the `repo` scope.

A post-MVP iteration will surface the Clerk-mediated OAuth identity
(via the `github_username` claim added in step 2 above) as the
preferred path and demote the PAT input to "Advanced". For now both
work side-by-side ; the PAT lives in the OS keyring just like the
auth session.
