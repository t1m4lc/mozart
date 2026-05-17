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
  readonly mac: string;
  readonly macIntel: string;
  readonly windows: string;
  readonly linux: string;
  readonly waitlist: string;
}

export interface SiteConfig {
  readonly version: string;
  readonly company: string;
  readonly copyrightYear: number;
  readonly promoStrip: PromoStripConfig;
  readonly downloads: DownloadsConfig;
  readonly social: SocialConfig;
}

export const SITE_CONFIG: SiteConfig = {
  version: 'v0.0.1',
  company: 'Mozart',
  copyrightYear: new Date().getFullYear(),
  promoStrip: {
    enabled: true,
    label: 'Join the Mozart community on Discord →',
    href: 'https://x.com',
  },
  downloads: {
    mac: '/download/mac',
    macIntel: '/download/mac-intel',
    windows: '/download/windows',
    linux: '/download/linux',
    waitlist:
      'https://docs.google.com/forms/d/1jPQsC8oLNIyjHW3WOsUxK2XNm0Z-BAzdooZuMs9cbFM/edit',
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
