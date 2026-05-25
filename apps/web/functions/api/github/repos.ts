import {
  clerkClientFor,
  json,
  verifyClerkBearer,
  type ClerkEnv,
  type PagesContext,
} from '../_lib/clerk';

type Env = ClerkEnv;

type GithubRepoRow = {
  readonly owner: string;
  readonly name: string;
  readonly full_name: string;
  readonly html_url: string;
  readonly clone_url: string;
  readonly private: boolean;
  readonly default_branch: string | null;
  readonly description: string | null;
  readonly updated_at: string | null;
};

type GhRepoApiRow = {
  readonly name?: unknown;
  readonly full_name?: unknown;
  readonly html_url?: unknown;
  readonly clone_url?: unknown;
  readonly private?: unknown;
  readonly default_branch?: unknown;
  readonly description?: unknown;
  readonly updated_at?: unknown;
  readonly owner?: { readonly login?: unknown };
};

export const onRequestPost = async ({
  request,
  env,
}: PagesContext<Env>): Promise<Response> => {
  const auth = await verifyClerkBearer(request, env);
  if (auth instanceof Response) return auth;

  const clerk = clerkClientFor(env);

  // Retrieve the user's Clerk-linked GitHub OAuth access token; Clerk
  // refreshes it transparently. Same pattern as oauth-token.ts.
  let oauthToken: string;
  try {
    const tokens = await clerk.users.getUserOauthAccessToken(
      auth.userId,
      'oauth_github',
    );
    const first = tokens.data?.[0];
    if (!first?.token) return json({ kind: 'not_linked' }, 404);
    oauthToken = first.token;
  } catch (err) {
    return json(
      { kind: 'server_error', message: (err as Error)?.message ?? 'clerk error' },
      502,
    );
  }

  // GitHub `/user/repos` lists repos visible to the authenticated user.
  // `affiliation=owner,collaborator,organization_member` mirrors the
  // default and is explicit for safety. `per_page=100` is GitHub's max;
  // we don't paginate yet — a future story can add cursor support if
  // users have >100 repos worth surfacing in the picker.
  let resp: Response;
  try {
    resp = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          authorization: `Bearer ${oauthToken}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'mozart-cloud',
        },
      },
    );
  } catch (err) {
    return json(
      { kind: 'server_error', message: `github fetch: ${(err as Error)?.message}` },
      502,
    );
  }

  if (resp.status === 401) return json({ kind: 'unauthorized' }, 401);
  if (!resp.ok) {
    return json(
      { kind: 'server_error', message: `github HTTP ${resp.status}` },
      502,
    );
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch (err) {
    return json(
      { kind: 'server_error', message: `github parse: ${(err as Error)?.message}` },
      502,
    );
  }
  if (!Array.isArray(raw)) {
    return json({ kind: 'server_error', message: 'github: unexpected shape' }, 502);
  }

  const repos: GithubRepoRow[] = raw
    .map((row): GithubRepoRow | null => {
      const r = row as GhRepoApiRow;
      const ownerLogin = typeof r.owner?.login === 'string' ? r.owner.login : null;
      const name = typeof r.name === 'string' ? r.name : null;
      const fullName = typeof r.full_name === 'string' ? r.full_name : null;
      const htmlUrl = typeof r.html_url === 'string' ? r.html_url : null;
      const cloneUrl = typeof r.clone_url === 'string' ? r.clone_url : null;
      if (!ownerLogin || !name || !fullName || !htmlUrl || !cloneUrl) return null;
      return {
        owner: ownerLogin,
        name,
        full_name: fullName,
        html_url: htmlUrl,
        clone_url: cloneUrl,
        private: r.private === true,
        default_branch:
          typeof r.default_branch === 'string' ? r.default_branch : null,
        description:
          typeof r.description === 'string' ? r.description : null,
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
      };
    })
    .filter((r): r is GithubRepoRow => r !== null);

  return json({ kind: 'ok', repos });
};
