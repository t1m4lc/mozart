export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeModeResolved = Omit<ThemeMode, 'system'>;

export const themes = ['zinc', 'stone'] as const;
export type ThemeOptions = typeof themes;
export type Theme = ThemeOptions[number];

export interface ThemeConfig {
  theme: Theme;
  mode: ThemeMode;
  options: ThemeOptions;
}

export interface ThemeState {
  theme: Theme;
  mode: ThemeMode;
  modeResolved: ThemeModeResolved;
}
