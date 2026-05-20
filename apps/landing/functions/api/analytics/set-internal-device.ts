import {
  INTERNAL_DEVICE_COOKIE,
  INTERNAL_DEVICE_COOKIE_MAX_AGE,
  buildSetCookie,
  constantTimeEquals,
  type PagesContext,
} from './_lib';

type Env = {
  readonly INTERNAL_DEVICE_TOKEN?: string;
};

type Body = { readonly token?: unknown };

export const onRequestPost = async ({
  request,
  env,
}: PagesContext<Env>) => {
  const expected = env.INTERNAL_DEVICE_TOKEN;
  if (!expected) {
    return jsonError(503, 'internal_device_token_unset');
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!constantTimeEquals(token, expected)) {
    return jsonError(401, 'invalid_token');
  }

  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  const cookie = buildSetCookie({
    name: INTERNAL_DEVICE_COOKIE,
    value: '1',
    maxAgeSeconds: INTERNAL_DEVICE_COOKIE_MAX_AGE,
    secure: isHttps,
    domain: url.hostname.endsWith('mozart.build') ? '.mozart.build' : undefined,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': cookie,
    },
  });
};

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
