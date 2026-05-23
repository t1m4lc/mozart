// Public surface of `desktop-core-util`. Pure helpers used across
// the cross-cutting platform layer. No Angular DI, no Tauri imports
// — values resolve via dynamic `import()` so heavy 3rd-party
// modules (xterm.js etc.) don't anchor in the eager bundle.

export {
  type CreateXtermOptions,
  createXterm,
  loadXterm,
} from './lib/util-xterm';
export { memoize } from './lib/util-memoize';
