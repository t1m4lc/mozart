export interface DocsAttributes {
  readonly description?: string;
  readonly order?: number;
}

export interface DocsEntry {
  readonly slug: string;
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
}

const DOCS_PATH_MARKER = '/src/content/docs/';
const UNGROUPED_GROUP_SLUG = 'getting-started';

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
  return [...byGroup.entries()]
    .sort(([slugA, entriesA], [slugB, entriesB]) => {
      if (slugA === UNGROUPED_GROUP_SLUG && slugB !== UNGROUPED_GROUP_SLUG) {
        return -1;
      }
      if (slugB === UNGROUPED_GROUP_SLUG && slugA !== UNGROUPED_GROUP_SLUG) {
        return 1;
      }
      return entriesA[0].groupTitle.localeCompare(entriesB[0].groupTitle);
    })
    .map(([slug, groupEntries]) => ({
      slug,
      title: groupEntries[0].groupTitle,
      entries: groupEntries,
    }));
}
