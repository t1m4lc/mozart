// Single source of truth for external Mozart links — marketing, social,
// docs, community. Lives in scope:shared so the desktop app, the
// landing site, and any future surface reuse the same URLs without
// drifting. The landing site historically used CF Pages path redirects
// (e.g. /discord → discord.gg/…) but those don't resolve inside the
// Tauri desktop runtime, so this file holds the absolute destinations.

export interface MozartLinks {
  readonly site: string;
  readonly docs: string;
  readonly changelog: string;
  readonly betaSignup: string;
  readonly community: {
    readonly discordInvite: string;
    readonly discordFeedbackChannel: string;
  };
  readonly social: {
    readonly github: string;
    readonly linkedin: string;
  };
  readonly contact: {
    readonly feedbackEmail: string;
  };
}

const DISCORD_INVITE = 'https://discord.gg/BpTAyFf7qk';

export const MOZART_LINKS: MozartLinks = {
  site: 'https://mozart.build',
  docs: 'https://mozart.build/docs',
  // Per-release slug appended at the call site, e.g.
  // `${MOZART_LINKS.changelog}/v0-1-0-beta-2`. Matches the file naming
  // convention in apps/landing/src/content/changelog/v<slug>.md.
  changelog: 'https://mozart.build/changelog',
  betaSignup: 'https://tally.so/r/eq07lQ',
  community: {
    discordInvite: DISCORD_INVITE,
    // TODO: swap for the dedicated #feedback channel deep link
    // (https://discord.com/channels/<server-id>/<channel-id>) once the
    // server IDs are pinned down. Falls back to the public invite so
    // users still land on Discord.
    discordFeedbackChannel: DISCORD_INVITE,
  },
  social: {
    github: 'https://github.com/t1m4lc',
    linkedin: 'https://www.linkedin.com/in/timothyalcaide/',
  },
  contact: {
    // TODO: switch to hello@mozart.build once the address is live.
    feedbackEmail: 'timothyalcaide@gmail.com',
  },
} as const;
