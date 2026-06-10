import type { PagesContext } from './analytics/_lib';

// Waitlist signups for the /for/* vertical landing pages, stored in
// Cloudflare KV under `waitlist:<email>`. Re-submitting from another
// vertical merges into the same record instead of duplicating it.
//
// Requires a KV namespace bound as `WAITLIST` on the mozart-landing Pages
// project (Production AND Preview). Direct Upload deploys don't carry
// bindings, so this is configured once in the CF dashboard and persists.
//
// Anti-spam: honeypot field (`hp`), minimum form age, browser-signal
// heuristics (user-agent + JSON content-type), and a per-IP rate limit
// (`rl:<ip>` keys, TTL'd). All fail silently with a fake success so bots
// get no signal.

type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

type Env = {
  readonly WAITLIST?: KvNamespace;
};

type Body = {
  readonly email?: unknown;
  readonly vertical?: unknown;
  readonly source?: unknown;
  readonly hp?: unknown;
  readonly formAge?: unknown;
};

type WaitlistEntry = {
  email: string;
  verticals: string[];
  source: string;
  firstTs: number;
  lastTs: number;
};

const VERTICALS = [
  'sales',
  'marketing',
  'recruiting',
  'small-business',
  'other',
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_FORM_AGE_MS = 1200;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 3600;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: PagesContext<Env>) => {
  // Browsers always send these; their absence marks scripted traffic.
  const userAgent = request.headers.get('user-agent') ?? '';
  const contentType = request.headers.get('content-type') ?? '';
  if (userAgent.length === 0 || !contentType.includes('application/json')) {
    return json(200, { ok: true });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const honeypot = typeof body.hp === 'string' ? body.hp : '';
  const formAge = typeof body.formAge === 'number' ? body.formAge : NaN;
  const tooFast = !Number.isNaN(formAge) && formAge < MIN_FORM_AGE_MS;
  if (honeypot.length > 0 || tooFast) {
    return json(200, { ok: true });
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return json(400, { error: 'invalid_email' });
  }

  const vertical = typeof body.vertical === 'string' ? body.vertical : '';
  if (!VERTICALS.includes(vertical as (typeof VERTICALS)[number])) {
    return json(400, { error: 'invalid_vertical' });
  }

  const kv = env.WAITLIST;
  if (!kv) {
    return json(503, { error: 'waitlist_unavailable' });
  }

  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    const rlKey = `rl:${ip}`;
    const count = Number((await kv.get(rlKey)) ?? '0');
    if (count >= RATE_LIMIT_MAX) {
      return json(200, { ok: true });
    }
    await kv.put(rlKey, String(count + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_S,
    });
  }

  const source = typeof body.source === 'string' ? body.source : 'unknown';
  const key = `waitlist:${email}`;
  const now = Date.now();

  const existingRaw = await kv.get(key);
  if (existingRaw) {
    let entry: WaitlistEntry;
    try {
      entry = JSON.parse(existingRaw) as WaitlistEntry;
    } catch {
      entry = { email, verticals: [], source, firstTs: now, lastTs: now };
    }
    if (!entry.verticals.includes(vertical)) {
      entry.verticals.push(vertical);
    }
    entry.lastTs = now;
    await kv.put(key, JSON.stringify(entry));
    return json(200, { ok: true, already: true });
  }

  const entry: WaitlistEntry = {
    email,
    verticals: [vertical],
    source,
    firstTs: now,
    lastTs: now,
  };
  await kv.put(key, JSON.stringify(entry));
  return json(200, { ok: true });
};
