import { type PagesContext, constantTimeEquals } from './analytics/_lib';

// Gated download resolver for the beta. Validates the access code
// server-side, then hands back the R2 URL for the requested platform.
//
// Hosting model: binaries + a per-version `manifest.json` live on R2
// (e.g. https://dl.mozart.build/v0.1.0-beta.0/...). The manifest maps an
// OS key to the actual bundle filename, so this function never needs to
// know exact filenames — only the version (env `DOWNLOAD_VERSION`).
//
// The gate is active ONLY while `DOWNLOAD_CODE` is set. Unset the secret
// (post beta.0.x, when downloads open to everyone) and the function serves
// links without a code — no code change required.

type Env = {
  readonly DOWNLOAD_CODE?: string;
  readonly DOWNLOAD_VERSION?: string;
  readonly DOWNLOAD_BASE_URL?: string;
};

type Body = { readonly os?: unknown; readonly code?: unknown };

const DEFAULT_BASE_URL = 'https://dl.mozart.build';
const DEFAULT_VERSION = '0.1.0-beta.0';
const OS_KEYS = ['mac', 'mac-intel', 'windows', 'linux'] as const;
type OsKey = (typeof OS_KEYS)[number];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: PagesContext<Env>) => {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const os = typeof body.os === 'string' ? body.os : '';
  if (!OS_KEYS.includes(os as OsKey)) {
    return json(400, { error: 'invalid_os' });
  }

  const expected = env.DOWNLOAD_CODE;
  if (expected) {
    const code = typeof body.code === 'string' ? body.code : '';
    const normalize = (s: string) => s.trim().toUpperCase();
    if (!constantTimeEquals(normalize(code), normalize(expected))) {
      return json(401, { error: 'invalid_code' });
    }
  }

  const base = (env.DOWNLOAD_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const version = env.DOWNLOAD_VERSION ?? DEFAULT_VERSION;

  let manifest: Partial<Record<OsKey, string>>;
  try {
    const res = await fetch(`${base}/v${version}/manifest.json`);
    if (!res.ok) return json(503, { error: 'manifest_unavailable' });
    manifest = (await res.json()) as Partial<Record<OsKey, string>>;
  } catch {
    return json(503, { error: 'manifest_unavailable' });
  }

  const file = manifest[os as OsKey];
  if (!file) return json(404, { error: 'build_unavailable' });

  return json(200, { url: `${base}/v${version}/${file}` });
};
