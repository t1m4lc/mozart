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
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
  { label: 'Changelog', href: '/changelog' },
] as const;

export const FOOTER_NAV: readonly NavColumn[] = [
  {
    title: 'Company',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Enterprise', href: '#', disabled: true },
      { label: 'Join us', href: '#', disabled: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'Changelog', href: '/changelog' },
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
