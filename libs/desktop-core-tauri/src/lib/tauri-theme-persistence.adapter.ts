import type {
  Theme,
  ThemeMode,
  ThemePersistence,
} from '@mozart/shared-util-theme';
import { commands } from './_bindings';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Backs ThemeService with the global settings.json (appearance section)
// via the resolved-settings IPC. Reads ignore any project layer (theme is
// a personal, global preference); writes go to the global file.
export function tauriThemePersistence(): ThemePersistence {
  return {
    async load() {
      const s = unwrap(await commands.getResolvedSettings(null));
      return {
        theme: s.appearance.theme as Theme,
        mode: s.appearance.colorMode as ThemeMode,
      };
    },
    async save({ theme, mode }) {
      const current = unwrap(await commands.getResolvedSettings(null));
      unwrap(
        await commands.saveGlobalSettings({
          ...current,
          appearance: { theme, colorMode: mode },
        }),
      );
    },
  };
}
