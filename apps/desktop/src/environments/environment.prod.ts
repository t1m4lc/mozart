// Production build — substituted in via fileReplacements.
//
// TODO(release): the desktop build pipeline must inject a real posthogKey
// (the prod PostHog project key) before GA, the way deploy-web.yml /
// deploy-landing.yml do for the web + landing prod envs. Until then the empty
// key keeps desktop analytics silent even in prod builds.
export const environment = {
  webBaseUrl: 'https://app.mozart.build',
  posthogKey: '',
  posthogHost: 'https://t.mozart.build',
};
