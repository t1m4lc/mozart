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
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Docs', href: '/docs' },
] as const;

export interface SolutionLink extends NavLink {
  readonly description: string;
}

export const SOLUTIONS_NAV: readonly SolutionLink[] = [
  {
    label: 'Sales',
    href: '/for/sales',
    description: 'Drafts, briefs, and prep from your files.',
  },
  {
    label: 'Marketing',
    href: '/for/marketing',
    description: 'On-brand content without the chat tab.',
  },
  {
    label: 'Recruiting',
    href: '/for/recruiting',
    description: 'Reading, writing, and prep, kept private.',
  },
  {
    label: 'Small Teams',
    href: '/for/small-business',
    description: 'Docs, ops, and business knowledge.',
  },
] as const;

export const FOOTER_NAV: readonly NavColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Download', href: '/download' },
      { label: 'Docs', href: '/docs' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Solutions',
    links: SOLUTIONS_NAV.map(({ label, href }) => ({ label, href })),
  },
  {
    title: 'Company',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Enterprise', href: '#', disabled: true },
      { label: 'Join us', href: '#', disabled: true },
      { label: 'llms.txt', href: '/llms.txt', external: true },
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
      label: label.slice(0, 1).toUpperCase() + label.slice(1),
      href,
      external: true,
    })),
  },
] as const;
