export interface ChangelogAttributes {
  readonly version: string;
  readonly date: string;
  readonly title: string;
}

export interface ChangelogEntry {
  readonly slug: string;
  readonly version: string;
  readonly title: string;
  readonly date: string;
  readonly formattedDate: string;
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
    month: 'short',
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
    content: typeof file.content === 'string' ? file.content : '',
  };
}

const FRONT_MATTER_RE = /^---[\r\n]+[\s\S]*?[\r\n]+---[\r\n]*/;

export function stripFrontMatter(source: string): string {
  return source.replace(FRONT_MATTER_RE, '');
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
