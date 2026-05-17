export interface BlogAuthor {
  readonly name: string;
  readonly avatar?: string;
  readonly role?: string;
}

export interface BlogAttributes {
  readonly title?: string;
  readonly description?: string;
  readonly date: string;
  readonly heroImage?: string;
  readonly authors?: readonly BlogAuthor[];
}

export interface BlogEntry {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly formattedDate: string;
  readonly heroImage?: string;
  readonly authors: readonly BlogAuthor[];
}

const BLOG_PATH_MARKER = '/src/content/blog/';

export function isBlogFile(filename: string): boolean {
  return filename.includes(BLOG_PATH_MARKER);
}

function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
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

export function toBlogEntry<T extends BlogAttributes>(file: {
  filename: string;
  attributes: T;
}): BlogEntry {
  const idx = file.filename.indexOf(BLOG_PATH_MARKER);
  const slug = file.filename
    .slice(idx + BLOG_PATH_MARKER.length)
    .replace(/\.md$/, '');
  return {
    slug,
    title: file.attributes.title ?? humanizeSlug(slug),
    description: file.attributes.description ?? '',
    date: file.attributes.date,
    formattedDate: formatDate(file.attributes.date),
    heroImage: file.attributes.heroImage,
    authors: file.attributes.authors ?? [],
  };
}

export function sortBlogEntriesNewestFirst(
  entries: readonly BlogEntry[],
): BlogEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = new Date(a.date).getTime() || 0;
    const bTime = new Date(b.date).getTime() || 0;
    return bTime - aTime;
  });
}
