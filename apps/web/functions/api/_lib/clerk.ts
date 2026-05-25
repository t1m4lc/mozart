import { createClerkClient, verifyToken } from '@clerk/backend';

export type ClerkEnv = {
  readonly CLERK_SECRET_KEY?: string;
};

export type PagesContext<Env = Record<string, never>> = {
  readonly request: Request;
  readonly env: Env;
};

export type VerifiedSession = { readonly userId: string };

export async function verifyClerkBearer<E extends ClerkEnv>(
  request: Request,
  env: E,
): Promise<VerifiedSession | Response> {
  const secret = env.CLERK_SECRET_KEY;
  if (!secret) {
    return json({ kind: 'server_error', message: 'CLERK_SECRET_KEY not bound' }, 500);
  }

  const header = request.headers.get('authorization');
  const prefix = 'Bearer ';
  if (!header || !header.startsWith(prefix)) {
    return json({ kind: 'unauthorized' }, 401);
  }
  const token = header.slice(prefix.length).trim();
  if (!token) return json({ kind: 'unauthorized' }, 401);

  try {
    const payload = await verifyToken(token, { secretKey: secret });
    const sub = payload?.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      return json({ kind: 'unauthorized' }, 401);
    }
    return { userId: sub };
  } catch {
    return json({ kind: 'unauthorized' }, 401);
  }
}

export function clerkClientFor<E extends ClerkEnv>(env: E) {
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
}

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(extra ?? {}),
    },
  });
}
