import { SITE_CONFIG } from './site-config';

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
  readonly disabled?: boolean;
}

export interface NavColumn {
  readonly title: string;
  readonly links: readonly NavLink[];
}

export const PRIMARY_NAV: readonly NavLink[] = [
  { label: 'Changelog', href: '/changelog' },
  { label: 'Docs', href: '/docs' },
] as const;

export const FOOTER_NAV: readonly NavColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Download', href: '/download' },
      { label: 'LLMs.txt', href: '/llms.txt', external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Enterprise', href: '#', disabled: true },
      { label: 'Join us', href: '#', disabled: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },

  {
    title: 'Connect',
    links: Object.entries(SITE_CONFIG.social).map(([label, href]) => ({
      label,
      href,
      external: true,
    })),
  },
] as const;
