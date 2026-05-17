export interface PromoStripConfig {
  readonly enabled: boolean;
  readonly label: string;
  readonly href: string;
}

export interface SocialConfig {
  // readonly youtube: string;
  // readonly reddit: string;
  readonly linkedin: string;
  readonly discord: string;
  readonly github: string;
}

export interface DownloadsConfig {
  /** Tally beta signup form. The dialog appends `?os=<os>` to tag the
   *  detected platform (mac, mac-intel, windows, linux, other). */
  readonly beta: string;
}

export interface SiteConfig {
  readonly version: string;
  readonly company: string;
  readonly copyrightYear: number;
  readonly promoStrip: PromoStripConfig;
  readonly downloads: DownloadsConfig;
  readonly social: SocialConfig;
}

const tally = 'https://tally.so/r/eq07lQ';

export const SITE_CONFIG: SiteConfig = {
  version: 'v0.0.1',
  company: 'Mozart',
  copyrightYear: new Date().getFullYear(),
  promoStrip: {
    enabled: true,
    label: 'Join the Mozart beta club →',
    href: tally,
  },
  downloads: {
    beta: tally,
  },
  // configure link in apps/landing/public/_redirects
  social: {
    // youtube: 'https://youtube.com/@mozartbuild',
    // reddit: 'https://reddit.com/r/mozartbuild',
    linkedin: '/linkedin',
    discord: '/discord', // Mozart Club
    github: '/github',
  },
} as const;
