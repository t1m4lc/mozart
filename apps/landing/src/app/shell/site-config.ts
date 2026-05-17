export interface PromoStripConfig {
  readonly enabled: boolean;
  readonly label: string;
  readonly href: string;
}

export interface SocialConfig {
  readonly x: string;
  readonly youtube: string;
  readonly linkedin: string;
  readonly reddit: string;
  readonly discord: string;
  readonly github: string;
}

export interface DownloadsConfig {
  readonly mac: string;
  readonly windows: string;
  readonly linux: string;
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
    windows: '/download/windows',
    linux: '/download/linux',
  },
  social: {
    x: 'https://x.com/mozartbuild',
    youtube: 'https://youtube.com/@mozartbuild',
    linkedin: 'https://linkedin.com/company/mozartbuild',
    reddit: 'https://reddit.com/r/mozartbuild',
    discord: 'https://discord.gg/mozart',
    github: 'https://github.com/mozart-build/mozart',
  },
} as const;
