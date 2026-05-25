import {
  clerkClientFor,
  json,
  verifyClerkBearer,
  type ClerkEnv,
  type PagesContext,
} from '../_lib/clerk';

type Env = ClerkEnv;

export const onRequestPost = async ({
  request,
  env,
}: PagesContext<Env>): Promise<Response> => {
  const auth = await verifyClerkBearer(request, env);
  if (auth instanceof Response) return auth;

  const clerk = clerkClientFor(env);

  let tokens;
  try {
    tokens = await clerk.users.getUserOauthAccessToken(auth.userId, 'oauth_github');
  } catch (err) {
    return json(
      { kind: 'server_error', message: (err as Error)?.message ?? 'clerk error' },
      502,
    );
  }

  const first = tokens.data?.[0];
  if (!first?.token) return json({ kind: 'not_linked' }, 404);

  let login: string | undefined;
  try {
    const user = await clerk.users.getUser(auth.userId);
    login = user.externalAccounts.find((a) => a.provider === 'oauth_github')?.username
      ?? undefined;
  } catch {
    login = undefined;
  }

  return json({ kind: 'ok', token: first.token, login });
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
