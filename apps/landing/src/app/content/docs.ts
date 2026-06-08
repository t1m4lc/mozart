export interface DocsAttributes {
  readonly description?: string;
  readonly order?: number;
}

export interface DocsEntry {
  readonly slug: string;
  readonly routerLink: readonly string[];
  readonly groupSlug: string;
  readonly groupTitle: string;
  readonly title: string;
  readonly description: string;
  readonly order: number;
  readonly isUngrouped: boolean;
}

export interface DocsGroup {
  readonly slug: string;
  readonly title: string;
  readonly entries: readonly DocsEntry[];
  readonly isComingSoon?: boolean;
}

const COMING_SOON_GROUPS: readonly DocsGroup[] = [
  { slug: 'how-to', title: 'How-to Guides', entries: [], isComingSoon: true },
  { slug: 'reference', title: 'Reference', entries: [], isComingSoon: true },
];

const DOCS_PATH_MARKER = '/src/content/docs/';
const UNGROUPED_GROUP_SLUG = 'getting-started';

const GROUP_ORDER: readonly string[] = [
  'getting-started',
  'concepts',
  'how-to',
  'reference',
  'community',
];

export function isDocsFile(filename: string): boolean {
  return filename.includes(DOCS_PATH_MARKER);
}

export function humanizeTitleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function humanizeSentenceCase(slug: string): string {
  const words = slug.replace(/[-_]/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toDocsEntry<T extends DocsAttributes>(file: {
  filename: string;
  attributes: T;
}): DocsEntry {
  const idx = file.filename.indexOf(DOCS_PATH_MARKER);
  const rel = file.filename
    .slice(idx + DOCS_PATH_MARKER.length)
    .replace(/\.md$/, '');
  const segments = rel.split('/');
  const isUngrouped = segments.length === 1;
  const folderSlug = isUngrouped ? UNGROUPED_GROUP_SLUG : segments[0];
  const fileSlug = segments[segments.length - 1];
  return {
    slug: rel,
    routerLink: ['/docs', ...segments],
    groupSlug: folderSlug,
    groupTitle: humanizeTitleCase(folderSlug),
    title: humanizeSentenceCase(fileSlug),
    description: file.attributes.description ?? '',
    order: file.attributes.order ?? Number.POSITIVE_INFINITY,
    isUngrouped,
  };
}

export function groupDocsEntries(entries: readonly DocsEntry[]): DocsGroup[] {
  const byGroup = new Map<string, DocsEntry[]>();
  for (const entry of entries) {
    const bucket = byGroup.get(entry.groupSlug) ?? [];
    bucket.push(entry);
    byGroup.set(entry.groupSlug, bucket);
  }
  for (const bucket of byGroup.values()) {
    bucket.sort((a, b) => {
      if (a.isUngrouped !== b.isUngrouped) return a.isUngrouped ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
  }
  const realGroups: DocsGroup[] = [...byGroup.entries()].map(
    ([slug, groupEntries]) => ({
      slug,
      title: groupEntries[0].groupTitle,
      entries: groupEntries,
    }),
  );
  return [...realGroups, ...COMING_SOON_GROUPS].sort(
    (a, b) => groupRank(a.slug) - groupRank(b.slug),
  );
}

function groupRank(slug: string): number {
  const idx = GROUP_ORDER.indexOf(slug);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}
