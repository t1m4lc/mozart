export type PageSection =
  | 'home'
  | 'blog'
  | 'docs'
  | 'changelog'
  | 'download'
  | 'other';

export function pageSection(path: string): PageSection {
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/blog')) return 'blog';
  if (path.startsWith('/docs')) return 'docs';
  if (path.startsWith('/changelog')) return 'changelog';
  if (path.startsWith('/download')) return 'download';
  return 'other';
}
