import {
  clerkClientFor,
  json,
  verifyClerkBearer,
  type ClerkEnv,
  type PagesContext,
} from '../_lib/clerk';

type Env = ClerkEnv;

// POST /api/onboarding/complete — flips the signed-in user's
// `unsafe_metadata.onboarding` to `true` via Clerk's Backend SDK (our
// secret key). This is the cross-surface source of truth: apps/web's
// profile page reads `unsafeMetadata.onboarding` and the `mozart` JWT
// template bakes it into the token the desktop decodes.
//
// The desktop calls this from Rust (with the Clerk session JWT as a
// bearer) instead of PATCHing the Clerk Frontend API directly, because
// that request is blocked by CORS from the `tauri.localhost` origin.
export const onRequestPost = async ({
  request,
  env,
}: PagesContext<Env>): Promise<Response> => {
  const auth = await verifyClerkBearer(request, env);
  if (auth instanceof Response) return auth;

  const clerk = clerkClientFor(env);

  try {
    await clerk.users.updateUserMetadata(auth.userId, {
      unsafeMetadata: { onboarding: true },
    });
  } catch (err) {
    return json(
      { kind: 'server_error', message: (err as Error)?.message ?? 'clerk error' },
      502,
    );
  }

  return json({ kind: 'ok' });
};

export const onRequest = async ({
  request,
}: PagesContext<Env>): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': request.headers.get('origin') ?? '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '600',
      },
    });
  }
  return json({ kind: 'method_not_allowed' }, 405);
};
