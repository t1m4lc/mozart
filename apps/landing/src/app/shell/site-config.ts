import { MOZART_LINKS } from '@mozart/shared-util-mozart-links';

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

// Landing-only knobs (version label, copyright, promo strip copy) stay
// here. External URLs (social, beta signup, community) are sourced from
// @mozart/shared-util-mozart-links so the desktop app and the landing
// site never drift on the destinations.
export const SITE_CONFIG: SiteConfig = {
  version: 'v0.1.0-beta.1',
  company: 'Mozart',
  copyrightYear: new Date().getFullYear(),
  promoStrip: {
    enabled: true,
    label: 'Request beta access →',
    href: MOZART_LINKS.betaSignup,
  },
  downloads: {
    beta: MOZART_LINKS.betaSignup,
  },
  social: {
    // youtube: 'https://youtube.com/@mozartbuild',
    // reddit: 'https://reddit.com/r/mozartbuild',
    linkedin: MOZART_LINKS.social.linkedin,
    discord: MOZART_LINKS.community.discordInvite,
    github: MOZART_LINKS.social.github,
  },
} as const;
