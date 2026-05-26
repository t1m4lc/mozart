// Heavy 3rd-party modules (xterm.js etc.) load via dynamic `import()`
// so they don't anchor in the eager bundle.

export {
  type CreateXtermOptions,
  createXterm,
  loadXterm,
  resolveXtermTheme,
} from './lib/util-xterm';
export { memoize } from './lib/util-memoize';
export {
  FEATURE_FLAGS,
  FeatureFlagsService,
  type FeatureFlags,
} from './lib/feature-flags';
