// Workspace name generator. Picks from a curated pool of 10 famous
// singers spanning classical to rap. Per-project uniqueness is enforced
// by suffixing a numeric counter ("eminem", "eminem-2", "eminem-3", …).

export const WORKSPACE_NAME_POOL: readonly string[] = [
  'pavarotti',
  'callas',
  'sinatra',
  'aretha',
  'elvis',
  'bowie',
  'mercury',
  'jackson',
  'marley',
  'eminem',
];

/**
 * Returns a workspace name not present in `taken`. Prefers an unused
 * pool entry; otherwise picks any pool entry and appends `-N` (starting
 * at 2) until the result is unique.
 */
export function generateWorkspaceName(taken: ReadonlySet<string>): string {
  const fresh = WORKSPACE_NAME_POOL.filter((n) => !taken.has(n));
  const base =
    fresh.length > 0
      ? pickRandom(fresh)
      : pickRandom(WORKSPACE_NAME_POOL);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
