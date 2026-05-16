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
    links: [
      { label: 'X', href: 'https://x.com/mozartbuild', external: true },
      {
        label: 'YouTube',
        href: 'https://youtube.com/@mozartbuild',
        external: true,
      },
      {
        label: 'LinkedIn',
        href: 'https://linkedin.com/company/mozartbuild',
        external: true,
      },
      {
        label: 'Reddit',
        href: 'https://reddit.com/r/mozartbuild',
        external: true,
      },
    ],
  },
] as const;
