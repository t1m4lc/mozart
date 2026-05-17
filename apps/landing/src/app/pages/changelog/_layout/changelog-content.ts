export interface ChangelogAttributes {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly detail?: boolean;
}

export interface ChangelogEntry {
  readonly slug: string;
  readonly version: string;
  readonly title: string;
  readonly date: string;
  readonly formattedDate: string;
  readonly detail: boolean;
  readonly content: string;
}

const CHANGELOG_PATH_MARKER = '/src/content/changelog/';

export function isChangelogFile(filename: string): boolean {
  return filename.includes(CHANGELOG_PATH_MARKER);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function toChangelogEntry<T extends ChangelogAttributes>(file: {
  filename: string;
  attributes: T;
  content?: string | object;
}): ChangelogEntry {
  const idx = file.filename.indexOf(CHANGELOG_PATH_MARKER);
  const slug = file.filename
    .slice(idx + CHANGELOG_PATH_MARKER.length)
    .replace(/\.md$/, '');
  return {
    slug,
    version: file.attributes.version,
    title: file.attributes.title,
    date: file.attributes.date,
    formattedDate: formatDate(file.attributes.date),
    detail: file.attributes.detail === true,
    content: typeof file.content === 'string' ? file.content : '',
  };
}

export function sortChangelogEntriesNewestFirst(
  entries: readonly ChangelogEntry[],
): ChangelogEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = new Date(a.date).getTime() || 0;
    const bTime = new Date(b.date).getTime() || 0;
    if (bTime !== aTime) return bTime - aTime;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });
}
