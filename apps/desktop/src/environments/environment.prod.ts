// Production build — substituted in via fileReplacements. The `posthogKey`
// is overwritten at build time from GitHub Variables by build-desktop.yml /
// release.yml (same approach as deploy-web.yml / deploy-landing.yml); the
// empty value here is just the committed placeholder for a key-less build.
export const environment = {
  webBaseUrl: 'https://app.mozart.build',
  posthogKey: '',
  posthogHost: 'https://t.mozart.build',
};
