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
  /** Gate the download dialog behind a beta access code. The code is
   *  validated server-side by `functions/api/download.ts` (env
   *  `DOWNLOAD_CODE`). Flip to `false` and unset the secret to open
   *  downloads to everyone — no other change needed. */
  readonly requireAccessCode: boolean;
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
  version: 'v0.1.0-beta.0',
  company: 'Mozart',
  copyrightYear: new Date().getFullYear(),
  promoStrip: {
    enabled: true,
    label: 'Mozart v0.1.0-beta.0 is out — Request access →',
    href: MOZART_LINKS.betaSignup,
  },
  downloads: {
    requireAccessCode: true,
  },
  social: {
    // youtube: 'https://youtube.com/@mozartbuild',
    // reddit: 'https://reddit.com/r/mozartbuild',
    linkedin: MOZART_LINKS.social.linkedin,
    discord: MOZART_LINKS.community.discordInvite,
    github: MOZART_LINKS.social.github,
  },
} as const;
